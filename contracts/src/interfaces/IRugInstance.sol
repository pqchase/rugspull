// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRugInstance {
    enum RugStatus {
        Opening,
        Failed,
        Active,
        Rugged
    }

    event Contributed(address indexed rug, address indexed user, uint256 amount);
    event LaunchFailed(address indexed rug, uint256 totalContributed, uint256 minLaunchAmount);
    event LaunchSucceeded(
        address indexed rug,
        address indexed token,
        address indexed pool,
        uint256 totalContributed,
        uint256 acceptedContribution,
        uint256 openingTokenAllocation,
        uint256 poolTokenReserve,
        uint256 poolQuoteReserve,
        uint256 founderAllocation
    );
    event ClaimedOpening(
        address indexed rug, address indexed user, uint256 tokenAmount, uint256 refundAmount
    );
    event ClaimedFailedRefund(address indexed rug, address indexed user, uint256 amount);
    event CreatorStakeWithdrawn(address indexed rug, address indexed creator, uint256 amount);
    event RugPulled(
        address indexed rug, address indexed creator, uint256 founderTokensSold, uint256 quoteOut
    );

    function contribute(uint256 amount) external;
    function finalize() external;
    function claimOpening() external;
    function claimFailedRefund() external;
    function withdrawCreatorStakeAfterFailure() external;
    function rug(uint256 minQuoteOut, uint256 deadline) external returns (uint256 quoteOut);
}
