// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IRugInstance } from "../src/interfaces/IRugInstance.sol";

interface VmClaimOpening {
    function envAddress(string calldata key) external view returns (address);
    function envUint(string calldata key) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract ClaimOpeningBscTestnet {
    VmClaimOpening internal constant vm =
        VmClaimOpening(address(uint160(uint256(keccak256("hevm cheat code")))));
    error WrongChain();

    function run() external {
        if (block.chainid != 97) revert WrongChain();
        uint256 key = vm.envUint("PRIVATE_KEY");
        address rug = vm.envAddress("RUG_ADDRESS");
        vm.startBroadcast(key);
        IRugInstance(rug).claimOpening();
        vm.stopBroadcast();
    }
}
