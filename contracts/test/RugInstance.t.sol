// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { MockWBNB } from "./MockWBNB.sol";
import { RugInstance } from "../src/RugInstance.sol";
import { RugToken } from "../src/RugToken.sol";
import { RugPool } from "../src/RugPool.sol";
import { IRugInstance } from "../src/interfaces/IRugInstance.sol";

contract RugInstanceTest is Test {
    uint256 internal constant CREATOR_STAKE = 10 ether;
    uint256 internal constant TOTAL_SUPPLY = 1_000_000 ether;

    MockWBNB internal wbnb;
    RugInstance internal instance;
    address internal creator = address(0xC0FFEE);
    address internal treasury = address(0x777);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        wbnb = new MockWBNB();
        instance = _newInstance(CREATOR_STAKE);
        wbnb.mint(address(instance), CREATOR_STAKE);
        wbnb.mint(alice, 20 ether);
        wbnb.mint(bob, 20 ether);
    }

    function _newInstance(uint256 stake) internal returns (RugInstance) {
        RugInstance.Config memory config = RugInstance.Config({
            factory: address(this),
            creator: creator,
            wbnb: address(wbnb),
            protocolTreasury: treasury,
            name: "Rug",
            symbol: "RUG",
            metadataURI: "ipfs://rug",
            metadataHash: bytes32("meta"),
            disclosureHash: bytes32("risk"),
            creatorStake: stake,
            founderBps: 4500,
            swapFeeBps: 25,
            protocolFeeBps: 5,
            minLaunchBps: 3000,
            openingCapBps: 5000,
            openingDuration: 1 days,
            founderUnlockDelay: 2 days,
            tokenTotalSupply: TOTAL_SUPPLY
        });
        return new RugInstance(config);
    }

    function _contribute(address user, uint256 amount) internal {
        vm.startPrank(user);
        wbnb.approve(address(instance), type(uint256).max);
        instance.contribute(amount);
        vm.stopPrank();
    }

    function _finalizeSuccess() internal {
        _contribute(alice, 4 ether);
        _contribute(bob, 4 ether);
        vm.warp(instance.openingEnd());
        instance.finalize();
    }

    function testOpeningConfigAndContributions() public {
        assertEq(instance.minLaunchAmount(), 3 ether);
        assertEq(instance.openingCap(), 5 ether);
        assertEq(instance.founderUnlockTime(), instance.openingEnd() + 2 days);
        assertEq(instance.protocolTreasury(), treasury);
        assertEq(instance.protocolFeeBps(), 5);

        _contribute(alice, 1 ether);
        assertEq(instance.totalContributed(), 1 ether);
        assertEq(instance.contributionOf(alice), 1 ether);
    }

    function testCreatorCannotContribute() public {
        wbnb.mint(creator, 1 ether);
        vm.startPrank(creator);
        wbnb.approve(address(instance), 1 ether);
        vm.expectRevert(RugInstance.CreatorCannotContribute.selector);
        instance.contribute(1 ether);
        vm.stopPrank();
    }

    function testFinalizeIsPermissionlessAndCannotRunEarly() public {
        _contribute(alice, 3 ether);

        vm.expectRevert(RugInstance.OpeningNotEnded.selector);
        instance.finalize();

        vm.warp(instance.openingEnd());
        vm.prank(address(0xCAFE));
        instance.finalize();
        assertEq(uint256(instance.status()), uint256(IRugInstance.RugStatus.Active));

        vm.expectRevert(RugInstance.BadStatus.selector);
        instance.finalize();
    }

    function testFinalizeFailureRefundAndCreatorWithdrawAreOneShot() public {
        _contribute(alice, 2 ether);
        vm.warp(instance.openingEnd());
        instance.finalize();
        assertEq(uint256(instance.status()), uint256(IRugInstance.RugStatus.Failed));

        uint256 beforeAlice = wbnb.balanceOf(alice);
        vm.prank(alice);
        instance.claimFailedRefund();
        assertEq(wbnb.balanceOf(alice), beforeAlice + 2 ether);
        vm.prank(alice);
        vm.expectRevert(RugInstance.AlreadyClaimed.selector);
        instance.claimFailedRefund();

        uint256 beforeCreator = wbnb.balanceOf(creator);
        vm.prank(creator);
        instance.withdrawCreatorStakeAfterFailure();
        assertEq(wbnb.balanceOf(creator), beforeCreator + CREATOR_STAKE);
        vm.prank(creator);
        vm.expectRevert(RugInstance.AlreadyWithdrawn.selector);
        instance.withdrawCreatorStakeAfterFailure();
    }

    function testSuccessfulFinalizeUsesRecommendedEconomics() public {
        _finalizeSuccess();

        assertEq(uint256(instance.status()), uint256(IRugInstance.RugStatus.Active));
        assertTrue(instance.token() != address(0));
        assertTrue(instance.pool() != address(0));
        assertEq(instance.acceptedContribution(), 5 ether);
        assertEq(instance.founderRemaining(), 450_000 ether);
        assertEq(instance.openingTokenAllocation(), 137_500 ether);
        assertEq(instance.poolTokenReserve(), 412_500 ether);
        assertEq(instance.poolQuoteReserve(), 15 ether);

        RugPool pool = RugPool(instance.pool());
        (uint112 reserveToken, uint112 reserveQuote) = pool.getReserves();
        assertEq(uint256(reserveToken), 412_500 ether);
        assertEq(uint256(reserveQuote), 15 ether);
        assertEq(RugToken(instance.token()).balanceOf(address(instance)), 587_500 ether);
    }

    function testOversubscriptionClaimPaysTokensAndProRataRefund() public {
        _finalizeSuccess();
        RugToken token = RugToken(instance.token());

        uint256 beforeWbnb = wbnb.balanceOf(alice);
        vm.prank(alice);
        instance.claimOpening();

        assertEq(token.balanceOf(alice), 68_750 ether);
        assertEq(wbnb.balanceOf(alice), beforeWbnb + 1.5 ether);
        vm.prank(alice);
        vm.expectRevert(RugInstance.AlreadyClaimed.selector);
        instance.claimOpening();
    }

    function testRugIsCreatorOnlyLockedAndOneShotWithProtocolFee() public {
        _finalizeSuccess();
        uint256 unlockTime = instance.founderUnlockTime();

        vm.expectRevert(RugInstance.NotCreator.selector);
        instance.rug(1, unlockTime);

        vm.prank(creator);
        vm.expectRevert(RugInstance.FounderLocked.selector);
        instance.rug(1, unlockTime);

        vm.warp(unlockTime);
        uint256 founder = instance.founderRemaining();
        uint256 beforeCreator = wbnb.balanceOf(creator);
        vm.prank(creator);
        uint256 out = instance.rug(1, block.timestamp);

        assertGt(out, 0);
        assertEq(wbnb.balanceOf(creator), beforeCreator + out);
        assertGt(wbnb.balanceOf(treasury), 0);
        assertEq(instance.founderRemaining(), 0);
        assertEq(uint256(instance.status()), uint256(IRugInstance.RugStatus.Rugged));
        assertGe(RugToken(instance.token()).balanceOf(instance.pool()), founder);
        assertEq(RugToken(instance.token()).balanceOf(creator), 0);

        vm.prank(creator);
        vm.expectRevert(RugInstance.BadStatus.selector);
        instance.rug(1, block.timestamp);
    }

    function testClaimsAndCanonicalPoolTradingContinueAfterRugged() public {
        _finalizeSuccess();
        vm.warp(instance.founderUnlockTime());
        vm.prank(creator);
        instance.rug(1, block.timestamp);

        vm.prank(alice);
        instance.claimOpening();
        assertEq(RugToken(instance.token()).balanceOf(alice), 68_750 ether);

        uint256 treasuryBefore = wbnb.balanceOf(treasury);
        vm.startPrank(bob);
        wbnb.approve(instance.pool(), 1 ether);
        uint256 tokensOut =
            RugPool(instance.pool()).buyExactQuoteForTokens(1 ether, 1, bob, block.timestamp);
        vm.stopPrank();

        assertGt(tokensOut, 0);
        assertGt(wbnb.balanceOf(treasury), treasuryBefore);
    }
}
