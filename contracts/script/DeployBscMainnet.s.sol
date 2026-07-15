// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script } from "forge-std/Script.sol";
import { RugFactory } from "../src/RugFactory.sol";

contract DeployBscMainnet is Script {
    address internal constant WBNB = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;

    error WrongChain();
    error UnsafeRoles();

    function run() external returns (RugFactory factory) {
        if (block.chainid != 56) revert WrongChain();

        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address treasury = vm.envAddress("PROTOCOL_TREASURY");
        address initialOwner = vm.envAddress("FACTORY_OWNER");
        if (treasury != initialOwner || treasury == deployer) revert UnsafeRoles();

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
