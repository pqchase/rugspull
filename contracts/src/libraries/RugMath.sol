// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library RugMath {
    uint256 internal constant BPS_DENOMINATOR = 10_000;

    error InvalidBps();
    error ZeroAmount();
    error ZeroReserve();
    error FeeTooHigh();

    function founderAllocation(uint256 totalSupply, uint16 founderBps)
        internal
        pure
        returns (uint256)
    {
        if (founderBps > BPS_DENOMINATOR) revert InvalidBps();
        return totalSupply * founderBps / BPS_DENOMINATOR;
    }

    function openingAccepted(uint256 totalContributed, uint256 openingCap)
        internal
        pure
        returns (uint256)
    {
        return totalContributed < openingCap ? totalContributed : openingCap;
    }

    function openingTokenAllocation(
        uint256 nonFounderSupply,
        uint256 creatorStake,
        uint256 acceptedContribution
    ) internal pure returns (uint256) {
        if (acceptedContribution == 0) return 0;
        return nonFounderSupply * acceptedContribution / (creatorStake + 2 * acceptedContribution);
    }

    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut, uint16 feeBps)
        internal
        pure
        returns (uint256)
    {
        if (amountIn == 0) revert ZeroAmount();
        if (reserveIn == 0 || reserveOut == 0) revert ZeroReserve();
        if (feeBps >= BPS_DENOMINATOR) revert FeeTooHigh();
        uint256 amountInAfterFee = amountIn * (BPS_DENOMINATOR - feeBps) / BPS_DENOMINATOR;
        if (amountInAfterFee == 0) revert ZeroAmount();
        uint256 amountOut = reserveOut * amountInAfterFee / (reserveIn + amountInAfterFee);
        if (amountOut == 0) revert ZeroAmount();
        return amountOut;
    }

    function feeAmount(uint256 amount, uint16 feeBps) internal pure returns (uint256) {
        if (feeBps >= BPS_DENOMINATOR) revert FeeTooHigh();
        return amount * feeBps / BPS_DENOMINATOR;
    }
}
