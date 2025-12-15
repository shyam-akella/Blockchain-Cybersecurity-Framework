// scripts/updateJudgeKey.js
const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

async function main() {
  const deployed = require("../deployedAddresses.json");
  const USER_AUTH = deployed.UserAuth || deployed.userAuth;

  const userAuth = await ethers.getContractAt("UserAuth", USER_AUTH);
  const [, , judge] = await ethers.getSigners();

  // 🔑 READ FULL PEM FILE (IMPORTANT)
  const pubKeyPath = path.join(__dirname, "..", "keys", "judge_pub.pem");
  const judgePubKeyPem = fs.readFileSync(pubKeyPath, "utf8");

  console.log("Updating Judge pubkey on-chain using judge account:", judge.address);
  console.log("Public key length:", judgePubKeyPem.length);

  const tx = await userAuth.connect(judge).updateMyPubKey(judgePubKeyPem);
  await tx.wait();

  console.log("✅ Judge public key updated correctly on-chain.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
