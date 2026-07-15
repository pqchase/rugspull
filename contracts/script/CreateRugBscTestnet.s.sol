// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IRugFactory } from "../src/interfaces/IRugFactory.sol";
import { IWBNB } from "../src/interfaces/IWBNB.sol";

interface VmCreateRug {
    function envAddress(string calldata key) external view returns (address);
    function envOr(string calldata key, bytes32 defaultValue) external view returns (bytes32);
    function envString(string calldata key) external view returns (string memory);
    function envUint(string calldata key) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

interface IRugFactoryView {
    function creationFee() external view returns (uint256);
}

contract CreateRugBscTestnet {
    VmCreateRug internal constant vm =
        VmCreateRug(address(uint160(uint256(keccak256("hevm cheat code")))));
    error WrongChain();

    function run() external returns (address rug) {
        if (block.chainid != 97) revert WrongChain();
        uint256 creatorKey = vm.envUint("PRIVATE_KEY");
        address factory = vm.envAddress("FACTORY_ADDRESS");
        IWBNB wbnb = IWBNB(vm.envAddress("WBNB"));
        string memory name = vm.envString("RUG_NAME");
        string memory symbol = vm.envString("RUG_SYMBOL");
        string memory metadataURI = vm.envString("METADATA_URI");
        bytes32 metadataHash = vm.envOr("METADATA_HASH", keccak256(bytes(metadataURI)));
        uint256 creatorStake = vm.envUint("CREATOR_STAKE");
        uint256 creationFee = IRugFactoryView(factory).creationFee();
        uint256 wrapAmount = creatorStake + creationFee;

        vm.startBroadcast(creatorKey);
        wbnb.deposit{ value: wrapAmount }();
        wbnb.approve(factory, wrapAmount);
        rug = IRugFactory(factory)
            .createRug(
                IRugFactory.CreateRugParams({
                name: name,
                symbol: symbol,
                metadataURI: metadataURI,
                metadataHash: metadataHash,
                creatorStake: creatorStake
            })
            );
        vm.stopBroadcast();
    }
}
