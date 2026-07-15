// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRugPool {
    event Swap(
        address indexed pool,
        address indexed sender,
        address indexed to,
        bool quoteToToken,
        uint256 amountIn,
        uint256 amountOut,
        uint256 protocolFeeQuote,
        uint112 reserveToken,
        uint112 reserveQuote
    );

    function initialize(uint256 tokenAmount, uint256 quoteAmount) external;

    function buyExactQuoteForTokens(
        uint256 quoteIn,
        uint256 minTokensOut,
        address to,
        uint256 deadline
    ) external returns (uint256 tokensOut);

    function sellExactTokensForQuote(
        uint256 tokenIn,
        uint256 minQuoteOut,
        address to,
        uint256 deadline
    ) external returns (uint256 quoteOut);

    function sellFromRugInstance(uint256 tokenIn, uint256 minQuoteOut, address to, uint256 deadline)
        external
        returns (uint256 quoteOut);

    function getReserves() external view returns (uint112 reserveToken, uint112 reserveQuote);
}
