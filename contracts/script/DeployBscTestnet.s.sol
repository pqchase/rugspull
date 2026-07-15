// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";
import { RugFactory } from "../src/RugFactory.sol";

contract DeployBscTestnet is Script {
    address internal constant WBNB = 0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd;

    error WrongChain();

    function run() external returns (RugFactory factory) {
        if (block.chainid != 97) revert WrongChain();

        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address treasury = vm.envOr("PROTOCOL_TREASURY", deployer);
        address initialOwner = vm.envOr("FACTORY_OWNER", deployer);

        vm.startBroadcast(deployerKey);
        factory = new RugFactory(
            RugFactory.FactoryConfig({
                wbnb: WBNB,
                protocolTreasury: treasury,
                initialOwner: initialOwner,
                founderBps: 4_500,
                swapFeeBps: 25,
                protocolFeeBps: 5,
                minLaunchBps: 3_000,
                openingCapBps: 5_000,
                openingDuration: 1 days,
                founderUnlockDelay: 2 days,
                creationFee: 0.003 ether,
                minCreatorStake: 0.1 ether,
                tokenTotalSupply: 1_000_000_000 ether
            })
        );
        vm.stopBroadcast();
    }
}
