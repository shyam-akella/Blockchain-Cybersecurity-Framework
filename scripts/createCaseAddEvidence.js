const { ethers } = require("hardhat");

// Your deployed Management contract address
const MANAGEMENT_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

async function main() {
  const [deployer, investigator] = await ethers.getSigners();
  
  // 1. Connect to the contract as the Investigator
  const management = await ethers.getContractAt("Management", MANAGEMENT_ADDRESS);
  const mgmtAsInvestigator = management.connect(investigator);

  console.log("--- Creating Case & Adding Evidence ---");
  console.log("Investigator:", investigator.address);

  // 2. Create a Case (ID: 101)
  // We use a manual ID like the paper suggests for simplicity
  const CASE_ID = 101;
  console.log(`\nCreating Case #${CASE_ID}...`);
  
  let tx = await mgmtAsInvestigator.createCase(CASE_ID);
  await tx.wait();
  console.log("✅ Case created on-chain.");

  // 3. Add Evidence to the Case
  // In a real app, this CID comes from IPFS. Here is a dummy one.
  const SAMPLE_CID = "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco";
  const DESCRIPTION = "Forensic Image of HDD";

  console.log(`\nAdding evidence to Case #${CASE_ID}...`);
  tx = await mgmtAsInvestigator.addEvidence(CASE_ID, SAMPLE_CID, DESCRIPTION);
  await tx.wait();
  console.log("✅ Evidence logged successfully.");

  // 4. Verify data
  const evidenceCount = await management.getEvidenceCount(CASE_ID);
  const latestEvidence = await management.getEvidence(CASE_ID, 0);

  console.log("\n--- Verification ---");
  console.log("Total Evidence Count:", evidenceCount.toString());
  console.log("Evidence #0 CID:", latestEvidence.fileCID);
  console.log("Evidence #0 Added By:", latestEvidence.addedBy);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});