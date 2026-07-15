// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IRugPool } from "../src/interfaces/IRugPool.sol";

interface IERC20Approve {
    function approve(address spender, uint256 amount) external returns (bool);
}

interface VmSellRug {
    function envAddress(string calldata key) external view returns (address);
    function envUint(string calldata key) external view returns (uint256);
    function envOr(string calldata key, uint256 defaultValue) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract SellRugBscTestnet {
    VmSellRug internal constant vm =
        VmSellRug(address(uint160(uint256(keccak256("hevm cheat code")))));
    error WrongChain();

    function run() external {
        if (block.chainid != 97) revert WrongChain();
        uint256 key = vm.envUint("PRIVATE_KEY");
        address token = vm.envAddress("TOKEN_ADDRESS");
        address pool = vm.envAddress("POOL_ADDRESS");
        address to = vm.envAddress("TO");
        uint256 tokenIn = vm.envUint("TOKEN_IN");
        uint256 minQuoteOut = vm.envOr("MIN_QUOTE_OUT", uint256(1));
        uint256 deadline = block.timestamp + vm.envOr("DEADLINE_SECONDS", uint256(1200));

        vm.startBroadcast(key);
        IERC20Approve(token).approve(pool, tokenIn);
        IRugPool(pool).sellExactTokensForQuote(tokenIn, minQuoteOut, to, deadline);
        vm.stopBroadcast();
    }
}
