const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // 1. Deploy UserAuth
  const UserAuth = await ethers.getContractFactory("UserAuth");
  const userAuth = await UserAuth.deploy();
  await userAuth.waitForDeployment(); // Waits for deployment to complete
  console.log("UserAuth deployed to:", userAuth.target);

  // 2. Deploy Management (passing UserAuth address)
  const Management = await ethers.getContractFactory("Management");
  const management = await Management.deploy(userAuth.target);
  await management.waitForDeployment();
  console.log("Management deployed to:", management.target);

  // 3. Print addresses for use later
  console.log("\nCONTRACT_ADDRESSES:");
  console.log("USER_AUTH_ADDRESS=", userAuth.target);
  console.log("MANAGEMENT_ADDRESS=", management.target);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
