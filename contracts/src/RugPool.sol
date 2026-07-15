// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IRugPool } from "./interfaces/IRugPool.sol";
import { RugMath } from "./libraries/RugMath.sol";
import { TransferLib } from "./libraries/TransferLib.sol";

contract RugPool is IRugPool {
    using TransferLib for address;

    address public immutable token;
    address public immutable WBNB;
    address public immutable rugInstance;
    address public immutable protocolTreasury;
    uint16 public immutable swapFeeBps;
    uint16 public immutable protocolFeeBps;

    uint112 public reserveToken;
    uint112 public reserveQuote;
    bool public initialized;

    uint256 private locked = 1;

    error NotRugInstance();
    error AlreadyInitialized();
    error NotInitialized();
    error Expired();
    error Slippage();
    error ReserveOverflow();
    error ZeroTo();
    error Reentrant();
    error BadConfig();

    modifier nonReentrant() {
        if (locked != 1) revert Reentrant();
        locked = 2;
        _;
        locked = 1;
    }

    constructor(
        address token_,
        address wbnb_,
        address rugInstance_,
        address protocolTreasury_,
        uint16 swapFeeBps_,
        uint16 protocolFeeBps_
    ) {
        if (
            token_ == address(0) || token_.code.length == 0 || wbnb_ == address(0)
                || wbnb_.code.length == 0 || rugInstance_ == address(0)
                || protocolTreasury_ == address(0) || uint256(swapFeeBps_) + protocolFeeBps_ > 1_000
        ) revert BadConfig();
        token = token_;
        WBNB = wbnb_;
        rugInstance = rugInstance_;
        protocolTreasury = protocolTreasury_;
        swapFeeBps = swapFeeBps_;
        protocolFeeBps = protocolFeeBps_;
    }

    function initialize(uint256 tokenAmount, uint256 quoteAmount) external {
        if (msg.sender != rugInstance) revert NotRugInstance();
        if (initialized) revert AlreadyInitialized();
        initialized = true;
        _setReserves(tokenAmount, quoteAmount);
    }

    function getReserves() external view returns (uint112, uint112) {
        return (reserveToken, reserveQuote);
    }

    function buyExactQuoteForTokens(
        uint256 quoteIn,
        uint256 minTokensOut,
        address to,
        uint256 deadline
    ) external nonReentrant returns (uint256 tokensOut) {
        _checkSwap(to, deadline);
        uint112 rt = reserveToken;
        uint112 rq = reserveQuote;
        uint256 protocolFeeQuote = RugMath.feeAmount(quoteIn, protocolFeeBps);
        uint256 poolQuoteIn = quoteIn - protocolFeeQuote;
        tokensOut = RugMath.getAmountOut(poolQuoteIn, rq, rt, swapFeeBps);
        if (tokensOut < minTokensOut) revert Slippage();
        _setReserves(uint256(rt) - tokensOut, uint256(rq) + poolQuoteIn);
        WBNB.safeTransferFrom(msg.sender, address(this), quoteIn);
        if (protocolFeeQuote != 0) WBNB.safeTransfer(protocolTreasury, protocolFeeQuote);
        token.safeTransfer(to, tokensOut);
        emit Swap(
            address(this),
            msg.sender,
            to,
            true,
            quoteIn,
            tokensOut,
            protocolFeeQuote,
            reserveToken,
            reserveQuote
        );
    }

    function sellExactTokensForQuote(
        uint256 tokenIn,
        uint256 minQuoteOut,
        address to,
        uint256 deadline
    ) external nonReentrant returns (uint256 quoteOut) {
        _checkSwap(to, deadline);
        token.safeTransferFrom(msg.sender, address(this), tokenIn);
        quoteOut = _sell(tokenIn, minQuoteOut, to, msg.sender);
    }

    function sellFromRugInstance(uint256 tokenIn, uint256 minQuoteOut, address to, uint256 deadline)
        external
        nonReentrant
        returns (uint256 quoteOut)
    {
        if (msg.sender != rugInstance) revert NotRugInstance();
        _checkSwap(to, deadline);
        quoteOut = _sell(tokenIn, minQuoteOut, to, msg.sender);
    }

    function _sell(uint256 tokenIn, uint256 minQuoteOut, address to, address sender)
        internal
        returns (uint256 quoteOut)
    {
        uint112 rt = reserveToken;
        uint112 rq = reserveQuote;
        uint256 grossQuoteOut = RugMath.getAmountOut(tokenIn, rt, rq, swapFeeBps);
        uint256 protocolFeeQuote = RugMath.feeAmount(grossQuoteOut, protocolFeeBps);
        quoteOut = grossQuoteOut - protocolFeeQuote;
        if (quoteOut < minQuoteOut) revert Slippage();
        _setReserves(uint256(rt) + tokenIn, uint256(rq) - grossQuoteOut);
        WBNB.safeTransfer(to, quoteOut);
        if (protocolFeeQuote != 0) WBNB.safeTransfer(protocolTreasury, protocolFeeQuote);
        emit Swap(
            address(this),
            sender,
            to,
            false,
            tokenIn,
            quoteOut,
            protocolFeeQuote,
            reserveToken,
            reserveQuote
        );
    }

    function _checkSwap(address to, uint256 deadline) internal view {
        if (!initialized) revert NotInitialized();
        if (to == address(0)) revert ZeroTo();
        if (block.timestamp > deadline) revert Expired();
    }

    function _setReserves(uint256 tokenAmount, uint256 quoteAmount) internal {
        if (tokenAmount > type(uint112).max || quoteAmount > type(uint112).max) {
            revert ReserveOverflow();
        }
        reserveToken = uint112(tokenAmount);
        reserveQuote = uint112(quoteAmount);
    }
}
