// scripts/createCaseAddEvidence_v2.js
const { ethers } = require("hardhat");

// Use your latest Management address
const MANAGEMENT_ADDRESS = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707";
const CASE_ID = 101;

async function main() {
  const [deployer, investigator] = await ethers.getSigners();
  console.log("Investigator:", investigator.address);

  const mgmt = await ethers.getContractAt("Management", MANAGEMENT_ADDRESS);

  // 1) Try to create the case (ignore if it already exists)
  try {
    console.log(`Creating Case #${CASE_ID}...`);
    const tx = await mgmt.connect(investigator).createCase(CASE_ID);
    await tx.wait();
    console.log("✅ Case created on-chain.");
  } catch (err) {
    console.log("createCase: (maybe already exists) —", err.message);
  }

  // 2) Add evidence with MIME type (image/jpeg used as example)
  const DUMMY_IPFS_CID = "QmDummyCidForImageTest1234567890";
  const MIME = "image/jpeg";
  console.log(`Adding evidence to Case #${CASE_ID} with CID ${DUMMY_IPFS_CID} and mimeType ${MIME}...`);
  try {
    const tx2 = await mgmt.connect(investigator).addEvidence(CASE_ID, DUMMY_IPFS_CID, "Test image evidence", MIME);
    await tx2.wait();
    console.log("✅ Evidence logged successfully. tx:", tx2.hash);
  } catch (err) {
    console.error("addEvidence failed:", err.message);
  }

  // 3) Verify
  try {
    const count = Number(await mgmt.getEvidenceCount(CASE_ID));
    console.log("Total Evidence Count:", count);
    if (count > 0) {
      const ev0 = await mgmt.getEvidence(CASE_ID, 0);
      console.log("Evidence #0 CID:", ev0.fileCID);
      console.log("Evidence #0 mimeType:", ev0.mimeType);
      console.log("Evidence #0 Added By:", ev0.addedBy);
    }
  } catch (err) {
    console.error("Verification read failed:", err.message);
  }
}

main().catch((err) => {
  console.error("Script error:", err);
  process.exitCode = 1;
});
