// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { MockWBNB } from "./MockWBNB.sol";
import { RugMath } from "../src/libraries/RugMath.sol";
import { RugPool } from "../src/RugPool.sol";
import { RugToken } from "../src/RugToken.sol";

contract RugPoolTest is Test {
    MockWBNB internal wbnb;
    RugToken internal token;
    RugPool internal pool;

    address internal constant ALICE = address(0xA11CE);
    address internal constant CREATOR = address(0xC0FFEE);
    address internal constant TREASURY = address(0x777);

    function setUp() public {
        wbnb = new MockWBNB();
        token = new RugToken("Rug", "RUG", address(this), 1_000_000 ether);
        pool = new RugPool(address(token), address(wbnb), address(this), TREASURY, 25, 5);
        assertTrue(token.transfer(address(pool), 500_000 ether));
        wbnb.mint(address(pool), 10 ether);
        pool.initialize(500_000 ether, 10 ether);
        wbnb.mint(ALICE, 10 ether);
        assertTrue(token.transfer(ALICE, 10_000 ether));
    }

    function testFixedSupplyTokenMintedOnce() public view {
        assertEq(token.totalSupply(), 1_000_000 ether);
        assertEq(
            token.balanceOf(address(pool)) + token.balanceOf(ALICE)
                + token.balanceOf(address(this)),
            1_000_000 ether
        );
    }

    function testPoolInitializesOnce() public {
        vm.expectRevert(RugPool.AlreadyInitialized.selector);
        pool.initialize(1, 1);
    }

    function testRejectsInvalidConstructorConfig() public {
        vm.expectRevert(RugPool.BadConfig.selector);
        new RugPool(address(0), address(wbnb), address(this), TREASURY, 25, 5);

        vm.expectRevert(RugPool.BadConfig.selector);
        new RugPool(address(token), address(0x1234), address(this), TREASURY, 25, 5);

        vm.expectRevert(RugPool.BadConfig.selector);
        new RugPool(address(token), address(wbnb), address(0), TREASURY, 25, 5);

        vm.expectRevert(RugPool.BadConfig.selector);
        new RugPool(address(token), address(wbnb), address(this), address(0), 25, 5);

        vm.expectRevert(RugPool.BadConfig.selector);
        new RugPool(address(token), address(wbnb), address(this), TREASURY, 996, 5);
    }

    function testBuyChargesQuoteProtocolFeeAndMatchesReserves() public {
        uint256 quoteIn = 1 ether;
        uint256 protocolFee = RugMath.feeAmount(quoteIn, 5);
        uint256 poolQuoteIn = quoteIn - protocolFee;
        uint256 expectedOut = RugMath.getAmountOut(poolQuoteIn, 10 ether, 500_000 ether, 25);

        vm.startPrank(ALICE);
        wbnb.approve(address(pool), type(uint256).max);
        uint256 out = pool.buyExactQuoteForTokens(quoteIn, expectedOut, ALICE, block.timestamp);
        vm.stopPrank();

        assertEq(out, expectedOut);
        assertEq(wbnb.balanceOf(TREASURY), protocolFee);
        (uint112 reserveToken, uint112 reserveQuote) = pool.getReserves();
        assertEq(uint256(reserveToken), 500_000 ether - expectedOut);
        assertEq(uint256(reserveQuote), 10 ether + poolQuoteIn);
        assertEq(token.balanceOf(address(pool)), uint256(reserveToken));
        assertEq(wbnb.balanceOf(address(pool)), uint256(reserveQuote));
    }

    function testSellChargesProtocolFeeFromQuoteOutput() public {
        uint256 tokenIn = 1_000 ether;
        uint256 grossOut = RugMath.getAmountOut(tokenIn, 500_000 ether, 10 ether, 25);
        uint256 protocolFee = RugMath.feeAmount(grossOut, 5);
        uint256 expectedNet = grossOut - protocolFee;
        uint256 aliceBefore = wbnb.balanceOf(ALICE);

        vm.startPrank(ALICE);
        token.approve(address(pool), type(uint256).max);
        uint256 netOut = pool.sellExactTokensForQuote(tokenIn, expectedNet, ALICE, block.timestamp);
        vm.stopPrank();

        assertEq(netOut, expectedNet);
        assertEq(wbnb.balanceOf(ALICE), aliceBefore + expectedNet);
        assertEq(wbnb.balanceOf(TREASURY), protocolFee);
        (uint112 reserveToken, uint112 reserveQuote) = pool.getReserves();
        assertEq(uint256(reserveToken), 501_000 ether);
        assertEq(uint256(reserveQuote), 10 ether - grossOut);
        assertEq(wbnb.balanceOf(address(pool)), uint256(reserveQuote));
    }

    function testFounderSellAlsoPaysWbnbProtocolFee() public {
        uint256 founderIn = 100_000 ether;
        assertTrue(token.transfer(address(pool), founderIn));
        uint256 treasuryBefore = wbnb.balanceOf(TREASURY);

        uint256 netOut = pool.sellFromRugInstance(founderIn, 1, CREATOR, block.timestamp);

        assertGt(netOut, 0);
        assertGt(wbnb.balanceOf(TREASURY), treasuryBefore);
        assertEq(wbnb.balanceOf(CREATOR), netOut);
    }

    function testSlippageDeadlineAndCallerChecks() public {
        vm.startPrank(ALICE);
        wbnb.approve(address(pool), type(uint256).max);
        vm.expectRevert(RugPool.Slippage.selector);
        pool.buyExactQuoteForTokens(1 ether, type(uint256).max, ALICE, block.timestamp);
        vm.expectRevert(RugPool.Expired.selector);
        pool.buyExactQuoteForTokens(1 ether, 1, ALICE, block.timestamp - 1);
        vm.expectRevert(RugPool.NotRugInstance.selector);
        pool.sellFromRugInstance(1 ether, 1, ALICE, block.timestamp);
        vm.stopPrank();
    }

    function testKDoesNotDecreaseAndDonationsRemainSurplus() public {
        (uint112 rt0, uint112 rq0) = pool.getReserves();
        uint256 k0 = uint256(rt0) * rq0;

        vm.startPrank(ALICE);
        wbnb.approve(address(pool), type(uint256).max);
        pool.buyExactQuoteForTokens(1 ether, 1, ALICE, block.timestamp);
        assertTrue(wbnb.transfer(address(pool), 0.25 ether));
        assertTrue(token.transfer(address(pool), 10 ether));
        vm.stopPrank();

        (uint112 rt1, uint112 rq1) = pool.getReserves();
        assertGe(uint256(rt1) * rq1, k0);
        assertEq(token.balanceOf(address(pool)), uint256(rt1) + 10 ether);
        assertEq(wbnb.balanceOf(address(pool)), uint256(rq1) + 0.25 ether);
    }

    function testPoolHasNoReserveWithdrawalSelector() public {
        (bool ok,) = address(pool).call(abi.encodeWithSignature("withdrawLiquidity(uint256)"));
        assertFalse(ok);
    }
}
