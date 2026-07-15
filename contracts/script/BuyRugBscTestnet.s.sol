// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IWBNB } from "../src/interfaces/IWBNB.sol";
import { IRugPool } from "../src/interfaces/IRugPool.sol";

interface VmBuyRug {
    function envAddress(string calldata key) external view returns (address);
    function envUint(string calldata key) external view returns (uint256);
    function envOr(string calldata key, uint256 defaultValue) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract BuyRugBscTestnet {
    VmBuyRug internal constant vm =
        VmBuyRug(address(uint160(uint256(keccak256("hevm cheat code")))));
    error WrongChain();

    function run() external {
        if (block.chainid != 97) revert WrongChain();
        uint256 key = vm.envUint("PRIVATE_KEY");
        IWBNB wbnb = IWBNB(vm.envAddress("WBNB"));
        address pool = vm.envAddress("POOL_ADDRESS");
        address to = vm.envAddress("TO");
        uint256 quoteIn = vm.envUint("QUOTE_IN");
        uint256 minTokensOut = vm.envOr("MIN_TOKENS_OUT", uint256(1));
        uint256 deadline = block.timestamp + vm.envOr("DEADLINE_SECONDS", uint256(1200));

        vm.startBroadcast(key);
        wbnb.deposit{ value: quoteIn }();
        wbnb.approve(pool, quoteIn);
        IRugPool(pool).buyExactQuoteForTokens(quoteIn, minTokensOut, to, deadline);
        vm.stopBroadcast();
    }
}
