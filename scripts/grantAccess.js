const { ethers } = require("hardhat");

const MANAGEMENT_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const CASE_ID = 101;

async function main() {
  const [deployer, investigator, judge, unauthorizedUser] = await ethers.getSigners();
  
  const management = await ethers.getContractAt("Management", MANAGEMENT_ADDRESS);

  console.log("--- Testing Granular Access Control ---");
  console.log("Investigator:", investigator.address);
  console.log("Judge:", judge.address);

  // 1. Simulate Client-Side Encryption
  // In the real React app, we would fetch the Judge's RSA Public Key 
  // and encrypt the AES file key. Here, we simulate that string.
  const FAKE_ENCRYPTED_KEY = "ENC_KEY_A1B2C3D4_FOR_JUDGE_ONLY";

  // 2. Grant Access (Investigator -> Judge)
  console.log(`\nGranting access for Case #${CASE_ID} to Judge...`);
  const mgmtAsInvestigator = management.connect(investigator);
  
  let tx = await mgmtAsInvestigator.grantAccess(CASE_ID, judge.address, FAKE_ENCRYPTED_KEY);
  await tx.wait();
  console.log("✅ Access granted on-chain.");

  // 3. Verify: Can the Judge retrieve the key?
  console.log("\nJudge attempting to retrieve key...");
  const mgmtAsJudge = management.connect(judge);
  const retrievedKey = await mgmtAsJudge.getMyEncryptedKey(CASE_ID);

  if (retrievedKey === FAKE_ENCRYPTED_KEY) {
    console.log("✅ SUCCESS: Judge retrieved the correct encrypted key!");
    console.log("Key:", retrievedKey);
  } else {
    console.error("❌ FAILURE: Key mismatch.");
  }

  // 4. Verify: Can a random user retrieve the key? (Should Fail)
  console.log("\nUnauthorized User attempting to retrieve key...");
  const mgmtAsRandom = management.connect(unauthorizedUser);
  
  // This produces a big error, so we verify the retrieved string is empty
  const emptyKey = await mgmtAsRandom.getMyEncryptedKey(CASE_ID);
  
  if (emptyKey === "") {
      console.log("✅ SUCCESS: Unauthorized user got empty key (Access Denied).");
  } else {
      console.log("❌ WARNING: Unauthorized user got a key!");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});