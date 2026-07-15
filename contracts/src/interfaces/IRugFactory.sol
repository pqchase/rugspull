// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRugFactory {
    struct CreateRugParams {
        string name;
        string symbol;
        string metadataURI;
        bytes32 metadataHash;
        uint256 creatorStake;
    }

    event RugCreated(
        address indexed rug,
        address indexed creator,
        string name,
        string symbol,
        uint256 creatorStake,
        uint40 openingEnd,
        bytes32 metadataHash,
        bytes32 disclosureHash
    );

    function createRug(CreateRugParams calldata params) external returns (address rug);
}
