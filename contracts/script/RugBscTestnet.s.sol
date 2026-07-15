// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IRugInstance } from "../src/interfaces/IRugInstance.sol";

interface VmRug {
    function envAddress(string calldata key) external view returns (address);
    function envUint(string calldata key) external view returns (uint256);
    function envOr(string calldata key, uint256 defaultValue) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract RugBscTestnet {
    VmRug internal constant vm = VmRug(address(uint160(uint256(keccak256("hevm cheat code")))));
    error WrongChain();

    function run() external {
        if (block.chainid != 97) revert WrongChain();
        uint256 key = vm.envUint("PRIVATE_KEY");
        address rug = vm.envAddress("RUG_ADDRESS");
        uint256 minQuoteOut = vm.envOr("MIN_QUOTE_OUT", uint256(1));
        uint256 deadline = block.timestamp + vm.envOr("DEADLINE_SECONDS", uint256(1200));
        vm.startBroadcast(key);
        IRugInstance(rug).rug(minQuoteOut, deadline);
        vm.stopBroadcast();
    }
}
