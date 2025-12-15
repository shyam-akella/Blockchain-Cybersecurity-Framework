const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // 1. Deploy UserAuth
  const UserAuth = await ethers.getContractFactory("UserAuth");
  const userAuth = await UserAuth.deploy();
  await userAuth.waitForDeployment();
  console.log("UserAuth deployed to:", userAuth.target);

  // 2. Deploy Management
  const Management = await ethers.getContractFactory("Management");
  const management = await Management.deploy(userAuth.target);
  await management.waitForDeployment();
  console.log("Management deployed to:", management.target);

  // 3. AUTO-SAVE ADDRESSES TO FILE (The Magic Part) 🪄
  const addresses = {
    UserAuth: userAuth.target,
    Management: management.target
  };

  // We save this file in the 'frontend' folder too, so the UI can find it later
  const addressFile = path.join(__dirname, "../deployedAddresses.json");
  
  fs.writeFileSync(
    addressFile,
    JSON.stringify(addresses, null, 2)
  );

  console.log(`\n✅ Addresses saved automatically to: ${addressFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});