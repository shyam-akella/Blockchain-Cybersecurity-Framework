// scripts/encryptUploadGrant.js
// top of scripts/encryptUploadGrant.js — update these constants
const fs = require("fs");
const forge = require("node-forge");
const { ethers } = require("hardhat");

// <<-- IMPORTANT: set these to the addresses you deployed to localhost -->> 
const USER_AUTH_ADDRESS = "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9";   // <-- paste your UserAuth address if different
const MANAGEMENT_ADDRESS = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707"; // <-- paste your Management address if different
const CASE_ID = 101;
const LOCAL_IPFS = "http://127.0.0.1:5001";

// Point to the image you added and set MIME
const FILE_PATH = "./sample_image.jpg";
const MIME_TYPE = "image/jpeg"; // change to image/png if your file is PNG


async function main() {
      // dynamic import for ESM-only ipfs-http-client
  const { create } = await import('ipfs-http-client');
  // 1) Read the sample file
  const path = "./sample_evidence.txt";
  if (!fs.existsSync(path)) {
    throw new Error("sample_evidence.txt not found in project root. Create it first.");
  }
  const fileBuf = fs.readFileSync(path);

  // 2) Generate AES-256 key and IV
  const aesKeyBytes = forge.random.getBytesSync(32); // 32 bytes = 256 bit
  const iv = forge.random.getBytesSync(12); // 12 bytes recommended for GCM

  // 3) AES-GCM encrypt the file (forge uses binary-strings)
  const cipher = forge.cipher.createCipher("AES-GCM", aesKeyBytes);
  cipher.start({ iv: iv });
  cipher.update(forge.util.createBuffer(fileBuf));
  cipher.finish();
  const encrypted = cipher.output.getBytes();
  const tag = cipher.mode.tag.getBytes();

  // 4) Build payload: iv + tag + encrypted -> base64
  const payloadBinary = iv + tag + encrypted;
  const payloadBase64 = Buffer.from(payloadBinary, "binary").toString("base64");

  // 5) Upload encrypted payload to IPFS (try local, else error)
  let ipfs;
  try {
    ipfs = create({ url: LOCAL_IPFS });
    // quick test call
    await ipfs.version();
  } catch (err) {
    console.error("Could not connect to local IPFS at", LOCAL_IPFS);
    console.error("Start IPFS (ipfs daemon or Docker) or change LOCAL_IPFS to a working IPFS HTTP API.");
    throw err;
  }

  console.log("Uploading encrypted file to IPFS...");
  const { cid } = await ipfs.add(Buffer.from(payloadBase64, "base64"));
  const fileCID = cid.toString();
  console.log("Encrypted file uploaded to IPFS CID:", fileCID);

  // 6) Attach contracts
  const userAuth = await ethers.getContractAt("UserAuth", USER_AUTH_ADDRESS);
  const mgmt = await ethers.getContractAt("Management", MANAGEMENT_ADDRESS);

  const [deployer, investigator, judge] = await ethers.getSigners();
  console.log("Investigator address (will add evidence & grant):", investigator.address);
  console.log("Judge address (will be granted):", judge.address);

    // 7) Investigator adds evidence record linking to the encrypted fileCID
  console.log("Calling addEvidence on-chain with MIME type...");
  const txAdd = await mgmt.connect(investigator).addEvidence(CASE_ID, fileCID, "Encrypted image evidence", MIME_TYPE);
  await txAdd.wait();
  console.log("addEvidence tx mined:", txAdd.hash);

  // 8) Fetch Judge public key (PEM) from UserAuth
  const judgePubKeyPem = await userAuth.getPubKey(judge.address);
  if (!judgePubKeyPem || judgePubKeyPem.length < 10) {
    throw new Error("Judge public key not found on-chain. Ensure you registered the judge with a public key.");
  }
  console.log("Fetched Judge public key (PEM) length:", judgePubKeyPem.length);

  // 9) RSA-encrypt the AES key (we send aesKey as base64)
  const aesKeyBase64 = Buffer.from(aesKeyBytes, "binary").toString("base64");
  const publicKey = forge.pki.publicKeyFromPem(judgePubKeyPem);
  const encryptedAESKeyBinary = publicKey.encrypt(aesKeyBase64, "RSA-OAEP", {
    md: forge.md.sha256.create(),
  });
  const encryptedAESKeyB64 = Buffer.from(encryptedAESKeyBinary, "binary").toString("base64");
  console.log("AES key encrypted with Judge's RSA public key. length:", encryptedAESKeyB64.length);

  // 10) Call grantAccess to store encrypted AES key on-chain for judge
  console.log("Calling grantAccess to store encrypted AES key on-chain...");
  const txGrant = await mgmt.connect(investigator).grantAccess(CASE_ID, judge.address, encryptedAESKeyB64);
  await txGrant.wait();
  console.log("grantAccess tx mined:", txGrant.hash);

  // 11) Verification: judge retrieves encrypted AES key and we decrypt it locally to verify
  const encKeyOnChain = await mgmt.connect(judge).getMyEncryptedKey(CASE_ID);
  console.log("Encrypted AES key retrieved from chain (first 60 chars):", encKeyOnChain.slice(0, 60));

  // Note: for real decrypt we would use judge's private key. Here we just verify it matches the stored value.
  if (encKeyOnChain === encryptedAESKeyB64) {
    console.log("✅ Full flow succeeded. Encrypted file on IPFS + encrypted AES key stored on-chain.");
    console.log("fileCID:", fileCID);
    console.log("You can now simulate judge-side decryption using the judge private key (not stored on-chain).");
  } else {
    console.error("❌ Mismatch: stored key does not match locally encrypted key.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Script failed:", err);
    process.exit(1);
  });
