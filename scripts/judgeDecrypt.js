const fs = require("fs");
const forge = require("node-forge");
const { ethers } = require("hardhat");
// const fs = require("fs");

// load deployed addresses automatically if available (project root: deployedAddresses.json)
let USER_AUTH_ADDRESS;
let MANAGEMENT_ADDRESS;

try {
  // deployedAddresses.json should be in project root, scripts is one level below
  const deployed = require('../deployedAddresses.json');
  USER_AUTH_ADDRESS = deployed.userAuth;
  MANAGEMENT_ADDRESS = deployed.management;
  console.log('Loaded addresses from deployedAddresses.json');
} catch (err) {
  // fallback to hardcoded addresses you had before (replace these with your last-known addresses)
  USER_AUTH_ADDRESS = "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9";
  MANAGEMENT_ADDRESS = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707";
  console.log('deployedAddresses.json not found — using fallback hardcoded addresses');
}

const CASE_ID = 101;
const LOCAL_IPFS = "http://127.0.0.1:5001";


async function main() {
  // dynamic import for ipfs-http-client (ESM)
  const { create } = await import('ipfs-http-client');

  // Attach contracts
  const userAuth = await ethers.getContractAt("UserAuth", USER_AUTH_ADDRESS);
  const mgmt = await ethers.getContractAt("Management", MANAGEMENT_ADDRESS);

  // Use judge signer (3rd signer in Hardhat node)
  const signers = await ethers.getSigners();
  const judge = signers[2];
  console.log("Using Judge account:", judge.address);

  // 1) Get encrypted AES key from chain (as judge)
  const encKeyB64 = await mgmt.connect(judge).getMyEncryptedKey(CASE_ID);
  if (!encKeyB64 || encKeyB64.length < 10) {
    throw new Error("No encrypted AES key found on-chain for this judge/case.");
  }
  console.log("Encrypted AES key (base64) length:", encKeyB64.length);

  // 2) Load judge private key (PEM) from local ./keys/judge_priv.pem
  const privPath = "./keys/judge_priv.pem";
  if (!fs.existsSync(privPath)) throw new Error("Missing judge private key at ./keys/judge_priv.pem");
  const privPem = fs.readFileSync(privPath, 'utf8');
  const privateKey = forge.pki.privateKeyFromPem(privPem);

  // 3) RSA-OAEP decrypt the AES key (returns base64 AES key)
  const encKeyBinary = Buffer.from(encKeyB64, 'base64').toString('binary');
  const aesKeyBase64 = privateKey.decrypt(encKeyBinary, 'RSA-OAEP', { md: forge.md.sha256.create() });
  // convert AES key back to binary-string (what forge expects)
  const aesKeyBinary = Buffer.from(aesKeyBase64, 'base64').toString('binary');
  console.log("AES key recovered (binary length):", aesKeyBinary.length);

  // 4) Fetch latest evidence entry for the case to get fileCID
  const count = Number(await mgmt.getEvidenceCount(CASE_ID));
  if (count === 0) throw new Error("No evidence found for case " + CASE_ID);
  const ev = await mgmt.getEvidence(CASE_ID, count - 1);
  const fileCID = ev.fileCID;
  console.log("Fetching encrypted file from IPFS CID:", fileCID);

    // 5) Download encrypted payload from IPFS (binary-safe)
  const ipfs = create({ url: LOCAL_IPFS });
  const parts = [];
  for await (const chunk of ipfs.cat(fileCID)) {
    // chunk is a Uint8Array; convert to Buffer and collect
    parts.push(Buffer.from(chunk));
  }
  const payloadBuf = Buffer.concat(parts); // Buffer of raw bytes

  // 6) Parse iv(12) + tag(16) + ciphertext from raw buffer
  const ivBuf = payloadBuf.slice(0, 12);            // Buffer(12)
  const tagBuf = payloadBuf.slice(12, 28);          // Buffer(16)
  const cipherBuf = payloadBuf.slice(28);           // Buffer(rest)

  // convert to forge-compatible binary strings
  const iv = ivBuf.toString('binary');
  const tag = tagBuf.toString('binary');
  const cipherText = cipherBuf.toString('binary');

  // 7) AES-GCM decrypt using forge
  const decipher = forge.cipher.createDecipher('AES-GCM', aesKeyBinary);
  decipher.start({ iv: iv, tag: tag });
  decipher.update(forge.util.createBuffer(cipherText));
  const ok = decipher.finish();
  if (!ok) throw new Error("AES-GCM authentication failed (tag mismatch)");

  const decryptedBinary = decipher.output.getBytes(); // binary string
  const plain = Buffer.from(decryptedBinary, 'binary').toString('utf8');

  console.log("\n✅ Decryption successful. Recovered plaintext (first 400 chars):\n");
  console.log(plain.slice(0, 400));
}

main().catch((err) => {
  console.error("Error:", err);
  process.exitCode = 1;
});
