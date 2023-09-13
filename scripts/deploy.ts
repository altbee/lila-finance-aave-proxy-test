import { Contract, ContractFactory } from "ethers";
// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import hre, { ethers } from "hardhat";
import { waitSeconds } from "./utils";

async function main(): Promise<void> {
  // Hardhat always runs the compile task when running scripts through it.
  // If this runs in a standalone fashion you may want to call compile manually
  // to make sure everything is compiled
  // await run("compile");

  // We get the contract to deploy

  // construction params
  const args = [
    "0xff34b3d4aee8ddcd6f9afffb6fe49bd371b8a357", // DAI
    "0x6ae43d3271ff6888e7fc43fd7321a503ff738951", // POOL
    "0x29598b72eb5cebd806c5dcd549490fda35b13cd8", // aDAI
  ];

  const AaveProxy: ContractFactory = await ethers.getContractFactory("AaveProxy");
  const aaveProxy: Contract = await AaveProxy.deploy(...args);
  await aaveProxy.deployed();

  console.log("AaveProxy deployed to:", aaveProxy.address);

  await waitSeconds(10);

  await hre.run("verify:verify", {
    address: aaveProxy.address,
    contract: "contracts/AaveProxy.sol:AaveProxy",
    constructorArguments: args,
  });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
