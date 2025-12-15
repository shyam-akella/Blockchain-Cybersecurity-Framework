// scripts/batchProcessByCase.js
const fs = require("fs");
const path = require("path");
const forge = require("node-forge");
const mime = require("mime-types");
const { ethers } = require("hardhat");

const ROOT_INPUT = path.join(__dirname, "..", "batch_input");
const LOCAL_IPFS = "http://127.0.0.1:5001";
const SLEEP_MS = 800;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function parseCaseId(folder) {
  const m = folder.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

async function main() {
  // Load deployed addresses
  const deployed = require("../deployedAddresses.json");
  const USER_AUTH = deployed.UserAuth || deployed.userAuth;
  const MANAGEMENT = deployed.Management || deployed.management;

  const { create } = await import("ipfs-http-client");
  const ipfs = create({ url: LOCAL_IPFS });

  const userAuth = await ethers.getContractAt("UserAuth", USER_AUTH);
  const mgmt = await ethers.getContractAt("Management", MANAGEMENT);

  const signers = await ethers.getSigners();
  const investigator = signers[1];
  const judge = signers[2];

  if (!fs.existsSync(ROOT_INPUT)) {
    console.error("❌ batch_input folder missing");
    return;
  }

  const caseFolders = fs.readdirSync(ROOT_INPUT)
    .filter(f => fs.statSync(path.join(ROOT_INPUT, f)).isDirectory());

  for (const folder of caseFolders) {
    const caseId = parseCaseId(folder);
    if (!caseId) continue;

    console.log(`\n=== Case ${caseId} ===`);

    // Create case if not exists
    try {
      const owner = await mgmt.caseOwner(caseId);
      if (owner === ethers.ZeroAddress) {
        const tx = await mgmt.connect(investigator).createCase(caseId);
        await tx.wait();
        console.log(`✔ Case ${caseId} created`);
      }
    } catch {
      const tx = await mgmt.connect(investigator).createCase(caseId);
      await tx.wait();
      console.log(`✔ Case ${caseId} created`);
    }

    const files = fs.readdirSync(path.join(ROOT_INPUT, folder))
      .filter(f => !f.startsWith("."));

    for (const file of files) {
      console.log(`Processing ${file}`);

      const filePath = path.join(ROOT_INPUT, folder, file);
      const buffer = fs.readFileSync(filePath);

      // AES encrypt
      const aesKey = forge.random.getBytesSync(32);
      const iv = forge.random.getBytesSync(12);
      const cipher = forge.cipher.createCipher("AES-GCM", aesKey);
      cipher.start({ iv });
      cipher.update(forge.util.createBuffer(buffer));
      cipher.finish();
      const encrypted = cipher.output.getBytes();
      const tag = cipher.mode.tag.getBytes();
      const payload = Buffer.from(iv + tag + encrypted, "binary");

      // Upload to IPFS
      const { cid } = await ipfs.add(payload);
      console.log("CID:", cid.toString());

      const mimeType = mime.lookup(file) || "application/octet-stream";
      const txAdd = await mgmt.connect(investigator)
        .addEvidence(caseId, cid.toString(), file, mimeType);
      await txAdd.wait();

      // Encrypt AES key for Judge
      const pubKeyPem = await userAuth.getPubKey(judge.address);
      const pubKey = forge.pki.publicKeyFromPem(pubKeyPem);
      const encKey = pubKey.encrypt(
        Buffer.from(aesKey, "binary").toString("base64"),
        "RSA-OAEP",
        { md: forge.md.sha256.create() }
      );

      const txGrant = await mgmt.connect(investigator)
        .grantAccess(caseId, judge.address,
          Buffer.from(encKey, "binary").toString("base64"));
      await txGrant.wait();

      console.log(`✔ ${file} added & access granted`);
      await sleep(SLEEP_MS);
    }
  }

  console.log("\n✅ Batch processing complete");
}

main().catch(console.error);
