import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { artifacts, ethers, waffle } from "hardhat";
import { constants } from "ethers";
import { expect } from "chai";

import { advanceBlock } from "./utils";
import { ZERO, ether, getSnapShot, revertEvm } from "./utils";
import { AaveProxy, IAavePool, IERC20 } from "../typechain";

let aaveProxy: AaveProxy, dai: IERC20, aDai: IERC20, pool: IAavePool;

let alice: SignerWithAddress, bob: SignerWithAddress;

// Sepolia contracts
const AAVE_POOL_ADDRESS = "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951";
const DAI_ADDRESS = "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357";
const ADAI_ADDRESS = "0x29598b72eb5CeBd806C5dCD549490FdA35B13cD8";
const DAI_WALLET = "0x6e7764cEA5C99afF9C107d06348429317254Db3B";

async function deployContracts() {
  const [deployer, alice, bob] = await ethers.getSigners();
  const carol = await ethers.getImpersonatedSigner(DAI_WALLET);

  const erc20Factory = await artifacts.readArtifact("IERC20");
  const dai = <IERC20>await ethers.getContractAt(erc20Factory.abi, DAI_ADDRESS);
  const aDai = <IERC20>await ethers.getContractAt(erc20Factory.abi, ADAI_ADDRESS);

  const aavePoolFactory = await artifacts.readArtifact("IAavePool");
  const pool = <IAavePool>await ethers.getContractAt(aavePoolFactory.abi, AAVE_POOL_ADDRESS);

  // send DAI to alice and bob
  await dai.connect(carol).transfer(alice.address, ether(100));
  await dai.connect(carol).transfer(bob.address, ether(100));

  const aaveProxy = <AaveProxy>(
    await (await ethers.getContractFactory("AaveProxy"))
      .connect(deployer)
      .deploy(dai.address, pool.address, aDai.address)
  );

  // approve
  await dai.connect(alice).approve(aaveProxy.address, constants.MaxUint256);
  await dai.connect(bob).approve(aaveProxy.address, constants.MaxUint256);

  return {
    deployer,
    alice,
    bob,
    carol,
    dai,
    aDai,
    pool,
    aaveProxy,
  };
}

describe("AaveProxy", function () {
  before("setup contracts", async () => {
    ({ alice, bob, dai, aDai, pool, aaveProxy } = await waffle.loadFixture(deployContracts));
  });

  describe("check initial values", () => {
    it("check token", async () => {
      expect(await aaveProxy.token()).to.equal(dai.address);
    });

    it("check pool", async () => {
      expect(await aaveProxy.pool()).to.equal(pool.address);
    });

    it("check aToken", async () => {
      expect(await aaveProxy.aToken()).to.equal(aDai.address);
    });
  });

  describe("alice deposit", function () {
    it("alice deposit 10 DAI", async () => {
      await aaveProxy.connect(alice).deposit(ether(10));

      expect(await dai.balanceOf(alice.address)).to.equal(ether(90));
    });

    it("check aDAI balance, totalShare and alice's userShare", async () => {
      expect(await aDai.balanceOf(aaveProxy.address)).to.equal(ether(10));

      expect(await aaveProxy.totalShare()).to.equal(ether(10));
      expect(await aaveProxy.userShares(alice.address)).to.equal(ether(10));
    });

    it("check aDAI balance after increase time", async () => {
      await advanceBlock();

      expect(await aDai.balanceOf(aaveProxy.address)).to.gt(ether(10));
      expect(await aaveProxy.getUserToken(alice.address)).to.gt(ether(10));
    });
  });

  describe("alice test withdraw and withdrawAll", function () {
    let snapshotID: any;
    before(async () => {
      snapshotID = await getSnapShot();
    });
    after(async () => {
      await revertEvm(snapshotID);
    });

    it("withdraw some", async () => {
      const balanceBefore = await dai.balanceOf(alice.address);
      await aaveProxy.connect(alice).withdraw(ether(5));
      const balanceAfter = await dai.balanceOf(alice.address);
      expect(balanceAfter.sub(balanceBefore)).to.gt(ether(5));
      expect(await aaveProxy.totalShare()).to.eq(ether(5));
      expect(await aaveProxy.userShares(alice.address)).to.eq(ether(5));
    });

    it("withdrawAll", async () => {
      const balanceBefore = await dai.balanceOf(alice.address);
      await aaveProxy.connect(alice).withdrawAll();
      const balanceAfter = await dai.balanceOf(alice.address);
      expect(balanceAfter.sub(balanceBefore)).to.gt(ether(5));
      expect(await aaveProxy.totalShare()).to.eq(ether(0));
      expect(await aaveProxy.userShares(alice.address)).to.eq(ether(0));
      expect(await aDai.balanceOf(aaveProxy.address)).to.equal(ZERO);
    });
  });

  describe("bob deposit more and test", function () {
    it("bob deposits 10 DAI", async () => {
      await aaveProxy.connect(bob).deposit(ether(10));
    });

    it("check totalShare, userShare of bob", async () => {
      expect(await aaveProxy.totalShare()).to.lt(ether(20));
      expect(await aaveProxy.userShares(alice.address)).to.eq(ether(10));
      expect(await aaveProxy.userShares(bob.address)).to.lt(ether(10));
    });

    it("bob and alice withdraw", async () => {
      await advanceBlock();

      expect(await aaveProxy.getUserToken(alice.address)).to.gt(ether(10));
      expect(await aaveProxy.getUserToken(bob.address)).to.gt(ether(10));

      await aaveProxy.connect(bob).withdraw(ether(5));
      expect(await dai.balanceOf(bob.address)).to.gt(ether(95));
      await aaveProxy.connect(alice).withdraw(ether(5));
      expect(await dai.balanceOf(alice.address)).to.gt(ether(95));

      await advanceBlock();
      expect(await aaveProxy.getUserToken(alice.address)).to.gt(ether(5));

      await aaveProxy.connect(bob).withdrawAll();
      expect(await dai.balanceOf(bob.address)).to.gt(ether(100));
      await aaveProxy.connect(alice).withdrawAll();
      expect(await dai.balanceOf(alice.address)).to.gt(ether(100));

      expect(await aaveProxy.totalShare()).to.eq(ZERO);
      expect(await aaveProxy.userShares(alice.address)).to.eq(ZERO);
      expect(await aaveProxy.userShares(bob.address)).to.eq(ZERO);
      expect(await aDai.balanceOf(aaveProxy.address)).to.eq(ZERO);
    });
  });
});
