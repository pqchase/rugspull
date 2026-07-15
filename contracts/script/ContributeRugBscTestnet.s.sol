// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IRugInstance } from "../src/interfaces/IRugInstance.sol";
import { IWBNB } from "../src/interfaces/IWBNB.sol";

interface VmContribute {
    function envAddress(string calldata key) external view returns (address);
    function envUint(string calldata key) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract ContributeRugBscTestnet {
    VmContribute internal constant vm =
        VmContribute(address(uint160(uint256(keccak256("hevm cheat code")))));
    error WrongChain();

    function run() external {
        if (block.chainid != 97) revert WrongChain();
        uint256 userKey = vm.envUint("PRIVATE_KEY");
        IWBNB wbnb = IWBNB(vm.envAddress("WBNB"));
        address rug = vm.envAddress("RUG_ADDRESS");
        uint256 amount = vm.envUint("CONTRIBUTION_AMOUNT");

        vm.startBroadcast(userKey);
        wbnb.deposit{ value: amount }();
        wbnb.approve(rug, amount);
        IRugInstance(rug).contribute(amount);
        vm.stopBroadcast();
    }
}
