// scripts/batchProcessFiles.js
// Batch encrypt -> ipfs add -> addEvidence -> grantAccess
// Safe, resumable, logs per-file.

const fs = require("fs");
const path = require("path");
const forge = require("node-forge");
const mime = require("mime-types");
const { ethers } = require("hardhat");

const INPUT_DIR = path.join(__dirname, "..", "batch_input");
const CASE_ID = 101; // change if needed
const LOCAL_IPFS = "http://127.0.0.1:5001";
const SLEEP_MS = 900; // small delay between txs to avoid nonce/gas clashing on localhost (tweak if needed)

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function main() {
  // load deployed addresses
  let deployed;
  try {
    deployed = require("../deployedAddresses.json");
    console.log("Loaded addresses from deployedAddresses.json");
  } catch (err) {
    console.error("deployedAddresses.json not found. Deploy first.");
    process.exit(1);
  }
  const USER_AUTH_ADDRESS = deployed.userAuth || deployed.UserAuth || deployed.userAuthAddress || deployed.UserAuthAddress;
  const MANAGEMENT_ADDRESS = deployed.management || deployed.Management || deployed.managementAddress || deployed.ManagementAddress;
  if (!USER_AUTH_ADDRESS || !MANAGEMENT_ADDRESS) {
    console.error("Could not find userAuth/management addresses in deployedAddresses.json");
    process.exit(1);
  }

  // dynamic import for ipfs-http-client (ESM-only)
  const { create } = await import("ipfs-http-client");

  // prepare IPFS client
  let ipfs;
  try {
    ipfs = create({ url: LOCAL_IPFS });
    await ipfs.version(); // verify connection
  } catch (err) {
    console.error("Could not connect to local IPFS at", LOCAL_IPFS, "\nStart IPFS daemon or change LOCAL_IPFS");
    throw err;
  }

  const userAuth = await ethers.getContractAt("UserAuth", USER_AUTH_ADDRESS);
  const mgmt = await ethers.getContractAt("Management", MANAGEMENT_ADDRESS);
  const signers = await ethers.getSigners();
  const investigator = signers[1]; // same mapping as before
  const judge = signers[2];

  // ensure input dir exists
  if (!fs.existsSync(INPUT_DIR)) {
    console.error("Input folder not found:", INPUT_DIR);
    console.error("Create the folder and put files inside it.");
    process.exit(1);
  }

  const files = fs.readdirSync(INPUT_DIR).filter((f) => !f.startsWith("."));
  console.log("Found files to process:", files.length);

  const results = [];

  for (const fname of files) {
    const filePath = path.join(INPUT_DIR, fname);
    try {
      console.log("\n----");
      console.log("Processing:", fname);

      // read file bytes
      const fileBuf = fs.readFileSync(filePath);

      // 1) AES-256-GCM encrypt (forge expects binary strings)
      const aesKeyBytes = forge.random.getBytesSync(32); // 256 bits
      const iv = forge.random.getBytesSync(12);
      const cipher = forge.cipher.createCipher("AES-GCM", aesKeyBytes);
      cipher.start({ iv: iv });
      cipher.update(forge.util.createBuffer(fileBuf));
      cipher.finish();
      const encrypted = cipher.output.getBytes();
      const tag = cipher.mode.tag.getBytes();

      // payload = iv (12) + tag (16) + encrypted
      const payload = Buffer.from(iv + tag + encrypted, "binary");

      // 2) Upload payload to IPFS
      console.log("Uploading encrypted payload to IPFS...");
      const { cid } = await ipfs.add(payload);
      const fileCID = cid.toString();
      console.log("Uploaded to CID:", fileCID);

      // 3) addEvidence(caseId, cid, filename, mimeType)
      const mt = mime.lookup(fname) || "application/octet-stream";
      console.log("Adding on-chain evidence: mimeType =", mt);
      const txAdd = await mgmt.connect(investigator).addEvidence(CASE_ID, fileCID, fname, mt);
      await txAdd.wait();
      console.log("addEvidence tx mined:", txAdd.hash);

      // small sleep before heavier ops
      await sleep(SLEEP_MS);

      // 4) Fetch judge public key
      const judgePubPem = await userAuth.getPubKey(judge.address);
      if (!judgePubPem || judgePubPem.length < 10) {
        throw new Error("Judge public key not found on-chain. Update judge key before running batch.");
      }

      // 5) RSA-OAEP encrypt the AES key (we send aesKey as base64)
      const aesKeyBase64 = Buffer.from(aesKeyBytes, "binary").toString("base64");
      const publicKey = forge.pki.publicKeyFromPem(judgePubPem);
      const encryptedAESKeyBinary = publicKey.encrypt(aesKeyBase64, "RSA-OAEP", {
        md: forge.md.sha256.create(),
      });
      const encryptedAESKeyB64 = Buffer.from(encryptedAESKeyBinary, "binary").toString("base64");
      console.log("Encrypted AES key length (base64):", encryptedAESKeyB64.length);

      // 6) grantAccess(caseId, judge, encryptedAESKeyB64)
      const txGrant = await mgmt.connect(investigator).grantAccess(CASE_ID, judge.address, encryptedAESKeyB64);
      await txGrant.wait();
      console.log("grantAccess tx mined:", txGrant.hash);

      results.push({ file: fname, cid: fileCID, mime: mt, success: true });
      // pause before next file to avoid spamming network
      await sleep(SLEEP_MS);
    } catch (err) {
      console.error("Failed processing", fname, "->", err.message || err);
      results.push({ file: fname, success: false, error: (err.message || String(err)) });
      // continue to next file
      await sleep(SLEEP_MS);
    }
  }

  console.log("\nBatch completed. Summary:");
  console.table(results);
  // Save results
  const outPath = path.join(__dirname, "..", "batch_results.json");
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log("Saved batch_results.json to project root.");
}

main().catch((err) => {
  console.error("Batch script error:", err);
  process.exitCode = 1;
});
