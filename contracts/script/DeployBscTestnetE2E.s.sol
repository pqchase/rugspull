// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";
import { RugFactory } from "../src/RugFactory.sol";

contract DeployBscTestnetE2E is Script {
    address internal constant WBNB = 0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd;

    error WrongChain();
    error BadDuration();

    function run() external returns (RugFactory factory) {
        if (block.chainid != 97) revert WrongChain();

        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address treasury = vm.envOr("PROTOCOL_TREASURY", deployer);
        uint256 openingDuration = vm.envOr("E2E_OPENING_DURATION", uint256(90));
        uint256 founderUnlockDelay = vm.envOr("E2E_FOUNDER_UNLOCK_DELAY", uint256(90));
        if (openingDuration == 0 || openingDuration > type(uint40).max) revert BadDuration();
        if (founderUnlockDelay == 0 || founderUnlockDelay > type(uint40).max) {
            revert BadDuration();
        }

        vm.startBroadcast(deployerKey);
        factory = new RugFactory(
            RugFactory.FactoryConfig({
                wbnb: WBNB,
                protocolTreasury: treasury,
                initialOwner: deployer,
                founderBps: 4_500,
                swapFeeBps: 25,
                protocolFeeBps: 5,
                minLaunchBps: 3_000,
                openingCapBps: 5_000,
                openingDuration: uint40(openingDuration),
                founderUnlockDelay: uint40(founderUnlockDelay),
                creationFee: 0.0003 ether,
                minCreatorStake: 0.01 ether,
                tokenTotalSupply: 1_000_000 ether
            })
        );
        vm.stopBroadcast();
    }
}
