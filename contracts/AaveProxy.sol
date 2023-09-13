// SPDX-License-Identifier: MIT
pragma solidity ^0.8.12;

import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IAavePool } from "./interfaces/IAavePool.sol";

/**
 * @notice AaveProxy Contract
 * It allows user to deposit DAI into Aave
 * It holds Aave balance
 * It allows user to withdraw DAI from Aave
 *
 * https://staging.aave.com/faucet/
 * https://staging.aave.com/
 * Sepolia
 * DAI: 0xff34b3d4aee8ddcd6f9afffb6fe49bd371b8a357
 * aDAI: 0x29598b72eb5cebd806c5dcd549490fda35b13cd8
 * Pool: 0x6ae43d3271ff6888e7fc43fd7321a503ff738951
 */

contract AaveProxy is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token; // Address of underlying token
    IAavePool public immutable pool; // Address of AAVE pool
    IERC20 public immutable aToken; // Address of wrapped token

    mapping(address => uint256) public userShares; // userAddress => share
    uint256 public totalShare;

    uint256 public constant SHARE_MULTIPLIER = 1e18;

    event Deposit(address user, uint256 amount, uint256 shareAmount);
    event Withdraw(address user, uint256 amount, uint256 shareAmount);

    /**
     * @notice constructor
     *
     * @param _token    {IERC20}    Address of underlying token
     * @param _pool     {IAavePool} Address of Aave pool contract
     * @param _aToken   {IERC20}    Address of wrapped token
     */
    constructor(IERC20 _token, IAavePool _pool, IERC20 _aToken) {
        require(address(_token) != address(0), "Invalid token");
        require(address(_pool) != address(0), "Invalid pool");
        require(address(_aToken) != address(0), "Invalid aToken");
        token = _token;
        pool = _pool;
        aToken = _aToken;

        token.approve(address(pool), type(uint256).max);
    }

    function getUserToken(address user) external view returns (uint256) {
        if (totalShare == 0) return 0;
        return (userShares[user] * aToken.balanceOf(address(this))) / totalShare;
    }

    /**
     * @notice Deposit
     *
     * @param amount    {uint256}   Amount of token to deposit
     */
    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "Invalid amount");
        token.safeTransferFrom(msg.sender, address(this), amount);

        if (token.allowance(address(this), address(pool)) < amount) {
            token.approve(address(pool), type(uint256).max);
        }

        uint256 prevBalance = aToken.balanceOf(address(this));
        pool.supply(address(token), amount, address(this), 0);
        uint256 aTokenAmount = aToken.balanceOf(address(this)) - prevBalance;
        uint256 shareAmount = aTokenAmount;
        if (totalShare > 0) {
            shareAmount = (aTokenAmount * totalShare) / prevBalance;
        }
        totalShare += shareAmount;
        userShares[msg.sender] += shareAmount;

        emit Deposit(msg.sender, amount, shareAmount);
    }

    /**
     * @notice withdraw token
     *
     * @param   shareAmount {uint256}   ShareAmount to withdraw
     */
    function withdraw(uint256 shareAmount) external nonReentrant {
        require(shareAmount <= userShares[msg.sender], "Invalid shareAmount");
        _withdraw(shareAmount);
    }

    /**
     * @notice withdraw all
     */
    function withdrawAll() external nonReentrant {
        _withdraw(userShares[msg.sender]);
    }

    function _withdraw(uint256 shareAmount) internal {
        uint256 aTokenBalance = aToken.balanceOf(address(this));
        uint256 aTokenAmount = (shareAmount * aTokenBalance) / totalShare;

        if (shareAmount == totalShare) {
            aTokenAmount = type(uint).max;
        }

        uint256 balanceBefore = token.balanceOf(msg.sender);
        pool.withdraw(address(token), aTokenAmount, msg.sender);
        uint256 balanceAfter = token.balanceOf(msg.sender);
        uint256 realTokenAmount = balanceAfter - balanceBefore;

        userShares[msg.sender] -= shareAmount;
        totalShare -= shareAmount;

        emit Withdraw(msg.sender, realTokenAmount, shareAmount);
    }
}
