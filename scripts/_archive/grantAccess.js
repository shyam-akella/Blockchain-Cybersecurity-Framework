const { ethers } = require("hardhat");

// MANAGEMENT_ADDRESS from your local deploy
const MANAGEMENT_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const CASE_ID = 101;

async function main() {
  const [deployer, investigator, judge, unauthorizedUser] = await ethers.getSigners();
  const management = await ethers.getContractAt("Management", MANAGEMENT_ADDRESS);

  console.log("--- Testing Granular Access Control ---");
  console.log("Investigator:", investigator.address);
  console.log("Judge:", judge.address);
  console.log("Unauthorized user:", unauthorizedUser.address);

  // 1) Simulate client-side RSA-encrypted AES key (in a real app you'd fetch judge pubkey and encrypt)
  const FAKE_ENCRYPTED_KEY = "ENC_KEY_A1B2C3D4_FOR_JUDGE_ONLY";

  // 2) Investigator grants access to Judge for CASE_ID
  console.log(`\nGranting access for Case #${CASE_ID} to Judge...`);
  const mgmtAsInvestigator = management.connect(investigator);
  const tx = await mgmtAsInvestigator.grantAccess(CASE_ID, judge.address, FAKE_ENCRYPTED_KEY);
  await tx.wait();
  console.log("✅ Access granted on-chain. tx:", tx.hash);

  // 3) Judge retrieves their encrypted key
  console.log("\nJudge attempting to retrieve key...");
  const mgmtAsJudge = management.connect(judge);
  const retrievedKey = await mgmtAsJudge.getMyEncryptedKey(CASE_ID);
  if (retrievedKey === FAKE_ENCRYPTED_KEY) {
    console.log("✅ SUCCESS: Judge retrieved the correct encrypted key!");
    console.log("Key:", retrievedKey);
  } else {
    console.error("❌ FAILURE: Key mismatch or empty. Got:", retrievedKey);
  }

  // 4) Unauthorized user attempts to retrieve key (should revert or be empty)
  console.log("\nUnauthorized user attempting to retrieve key...");
  const mgmtAsRandom = management.connect(unauthorizedUser);
  try {
    const maybeKey = await mgmtAsRandom.getMyEncryptedKey(CASE_ID);
    if (!maybeKey || maybeKey === "") {
      console.log("✅ SUCCESS: Unauthorized user received empty string (access denied).");
    } else {
      console.log("❌ WARNING: Unauthorized user got a key:", maybeKey);
    }
  } catch (err) {
    console.log("✅ SUCCESS: Unauthorized user was rejected by contract (reverted).");
  }
}

main().catch((error) => {
  console.error("Script error:", error);
  process.exitCode = 1;
});
