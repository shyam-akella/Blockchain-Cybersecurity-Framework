const { ethers } = require("hardhat");

// Paste your actual deployed UserAuth address here
const USER_AUTH_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

// Sample RSA public key for the Judge (placeholder)
const SAMPLE_JUDGE_PUBKEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwKx3fUpKz2p+6YvGQmJz
1f2q9kz0Q6G1YQkX1kz3K1z0Jq2Gf+V0wF2G3J6xL5gUuY3c2hQv3N0X8z7eQHkG
Yy3t1E9f1ZQxqPq+9X1YzQ1mVn5f6u7A9p3K0x1Z2q4y3p7K8j2Q== 
-----END PUBLIC KEY-----`;

async function main() {
  if (USER_AUTH_ADDRESS.includes("<")) {
    console.error("❌ Error: Please paste your real USER_AUTH_ADDRESS.");
    process.exit(1);
  }

  // Grab accounts from the Hardhat node
  const [deployer, investigator, judge] = await ethers.getSigners();
  
  console.log("--- Registering Users ---");
  console.log("Admin (Deployer):", deployer.address);
  console.log("Investigator:", investigator.address);
  console.log("Judge:", judge.address);

  // Connect to deployed UserAuth
  const userAuth = await ethers.getContractAt("UserAuth", USER_AUTH_ADDRESS);

  // Register Investigator (role = 2)
  console.log("\nRegistering Investigator...");
  let tx = await userAuth.connect(deployer).registerUser(investigator.address, 2, "");
  await tx.wait();
  console.log("✅ Investigator registered (Role 2)");

  // Register Judge (role = 4) with a sample public key
  console.log("\nRegistering Judge...");
  tx = await userAuth.connect(deployer).registerUser(judge.address, 4, SAMPLE_JUDGE_PUBKEY_PEM);
  await tx.wait();
  console.log("✅ Judge registered (Role 4) with RSA Public Key stored");

  // Verify
  const roleInv = await userAuth.getRole(investigator.address);
  const roleJudge = await userAuth.getRole(judge.address);
  const judgeKey = await userAuth.getPubKey(judge.address);

  console.log("\n--- Verification ---");
  console.log("Investigator Role:", roleInv.toString());
  console.log("Judge Role:", roleJudge.toString());
  console.log("Judge Public Key stored (first 30 chars):", judgeKey.substring(0, 30) + "...");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
