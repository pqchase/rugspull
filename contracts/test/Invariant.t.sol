// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { StdInvariant } from "forge-std/StdInvariant.sol";
import { Test } from "forge-std/Test.sol";
import { MockWBNB } from "./MockWBNB.sol";
import { RugInstance } from "../src/RugInstance.sol";
import { RugToken } from "../src/RugToken.sol";
import { RugPool } from "../src/RugPool.sol";
import { IRugInstance } from "../src/interfaces/IRugInstance.sol";

contract RugHandler is Test {
    uint256 internal constant CREATOR_STAKE = 10 ether;
    uint256 internal constant TOTAL_SUPPLY = 1_000_000 ether;
    uint256 internal constant MIN_SWAP_INPUT = 1e12;

    MockWBNB public immutable wbnb;
    RugInstance public immutable instance;
    address public immutable creator = address(0xC0FFEE);
    address public immutable treasury = address(0x777);
    address[3] internal actors = [address(0xA11CE), address(0xB0B), address(0xCAFE)];

    uint256 public protocolFeesObserved;
    uint256 public lastK;
    uint8 public lastStatus;
    bool public kDecreased;
    bool public statusDecreased;
    bool public doubleClaimSucceeded;
    bool public doubleRugSucceeded;

    constructor() {
        wbnb = new MockWBNB();
        RugInstance.Config memory config = RugInstance.Config({
            factory: address(this),
            creator: creator,
            wbnb: address(wbnb),
            protocolTreasury: treasury,
            name: "Invariant Rug",
            symbol: "IRUG",
            metadataURI: "ipfs://invariant",
            metadataHash: bytes32("meta"),
            disclosureHash: bytes32("risk"),
            creatorStake: CREATOR_STAKE,
            founderBps: 4500,
            swapFeeBps: 25,
            protocolFeeBps: 5,
            minLaunchBps: 3000,
            openingCapBps: 5000,
            openingDuration: 1 hours,
            founderUnlockDelay: 2 hours,
            tokenTotalSupply: TOTAL_SUPPLY
        });
        instance = new RugInstance(config);
        wbnb.mint(address(instance), CREATOR_STAKE);
        for (uint256 i; i < actors.length; ++i) {
            wbnb.mint(actors[i], 20 ether);
        }
    }

    function actorAt(uint256 index) external view returns (address) {
        return actors[index];
    }

    function actorCount() external pure returns (uint256) {
        return 3;
    }

    function contribute(uint256 actorSeed, uint256 amountSeed) external {
        if (
            instance.status() != IRugInstance.RugStatus.Opening
                || block.timestamp >= instance.openingEnd()
        ) return;
        address actor = actors[actorSeed % actors.length];
        uint256 balance = wbnb.balanceOf(actor);
        if (balance == 0) return;
        uint256 amount = bound(amountSeed, 1, balance);

        vm.startPrank(actor);
        wbnb.approve(address(instance), type(uint256).max);
        instance.contribute(amount);
        vm.stopPrank();
        _recordState();
    }

    function endOpening() external {
        if (
            instance.status() == IRugInstance.RugStatus.Opening
                && block.timestamp < instance.openingEnd()
        ) vm.warp(instance.openingEnd());
        _recordState();
    }

    function finalize() external {
        if (
            instance.status() == IRugInstance.RugStatus.Opening
                && block.timestamp >= instance.openingEnd()
        ) instance.finalize();
        _recordState();
    }

    function claim(uint256 actorSeed) external {
        IRugInstance.RugStatus current = instance.status();
        if (current != IRugInstance.RugStatus.Active && current != IRugInstance.RugStatus.Rugged) {
            return;
        }
        address actor = actors[actorSeed % actors.length];
        if (instance.contributionOf(actor) == 0 || instance.claimed(actor)) return;

        vm.prank(actor);
        instance.claimOpening();
        _recordState();
    }

    function refund(uint256 actorSeed) external {
        if (instance.status() != IRugInstance.RugStatus.Failed) return;
        address actor = actors[actorSeed % actors.length];
        if (instance.contributionOf(actor) == 0 || instance.claimed(actor)) return;

        vm.prank(actor);
        instance.claimFailedRefund();
        _recordState();
    }

    function withdrawFailedStake() external {
        if (instance.status() != IRugInstance.RugStatus.Failed || instance.creatorStakeWithdrawn())
        {
            return;
        }
        vm.prank(creator);
        instance.withdrawCreatorStakeAfterFailure();
        _recordState();
    }

    function endFounderLock() external {
        if (
            instance.status() == IRugInstance.RugStatus.Active
                && block.timestamp < instance.founderUnlockTime()
        ) vm.warp(instance.founderUnlockTime());
        _recordState();
    }

    function buy(uint256 actorSeed, uint256 amountSeed) external {
        IRugInstance.RugStatus current = instance.status();
        if (current != IRugInstance.RugStatus.Active && current != IRugInstance.RugStatus.Rugged) {
            return;
        }
        address actor = actors[actorSeed % actors.length];
        uint256 balance = wbnb.balanceOf(actor);
        if (balance < MIN_SWAP_INPUT) return;
        uint256 amount = bound(amountSeed, MIN_SWAP_INPUT, balance);
        RugPool pool = RugPool(instance.pool());
        (uint112 reserveToken, uint112 reserveQuote) = pool.getReserves();
        uint256 protocolFee = amount * pool.protocolFeeBps() / 10_000;
        uint256 poolInput = amount - protocolFee;
        uint256 afterLpFee = poolInput * (10_000 - pool.swapFeeBps()) / 10_000;
        if (
            afterLpFee == 0
                || uint256(reserveToken) * afterLpFee / (uint256(reserveQuote) + afterLpFee) == 0
        ) return;

        uint256 treasuryBefore = wbnb.balanceOf(treasury);
        vm.startPrank(actor);
        wbnb.approve(address(pool), type(uint256).max);
        pool.buyExactQuoteForTokens(amount, 0, actor, block.timestamp);
        vm.stopPrank();
        protocolFeesObserved += wbnb.balanceOf(treasury) - treasuryBefore;
        _recordState();
    }

    function sell(uint256 actorSeed, uint256 amountSeed) external {
        IRugInstance.RugStatus current = instance.status();
        if (current != IRugInstance.RugStatus.Active && current != IRugInstance.RugStatus.Rugged) {
            return;
        }
        address actor = actors[actorSeed % actors.length];
        RugToken token = RugToken(instance.token());
        uint256 balance = token.balanceOf(actor);
        if (balance < MIN_SWAP_INPUT) return;
        uint256 amount = bound(amountSeed, MIN_SWAP_INPUT, balance);
        RugPool pool = RugPool(instance.pool());
        (uint112 reserveToken, uint112 reserveQuote) = pool.getReserves();
        uint256 afterLpFee = amount * (10_000 - pool.swapFeeBps()) / 10_000;
        if (
            afterLpFee == 0
                || uint256(reserveQuote) * afterLpFee / (uint256(reserveToken) + afterLpFee) == 0
        ) return;

        uint256 treasuryBefore = wbnb.balanceOf(treasury);
        vm.startPrank(actor);
        token.approve(address(pool), type(uint256).max);
        pool.sellExactTokensForQuote(amount, 0, actor, block.timestamp);
        vm.stopPrank();
        protocolFeesObserved += wbnb.balanceOf(treasury) - treasuryBefore;
        _recordState();
    }

    function rug() external {
        if (
            instance.status() != IRugInstance.RugStatus.Active
                || block.timestamp < instance.founderUnlockTime()
        ) return;
        uint256 treasuryBefore = wbnb.balanceOf(treasury);
        vm.prank(creator);
        instance.rug(0, block.timestamp);
        protocolFeesObserved += wbnb.balanceOf(treasury) - treasuryBefore;
        _recordState();
    }

    function probeDoubleClaim(uint256 actorSeed) external {
        address actor = actors[actorSeed % actors.length];
        if (!instance.claimed(actor)) return;
        bytes memory callData;
        if (instance.status() == IRugInstance.RugStatus.Failed) {
            callData = abi.encodeCall(RugInstance.claimFailedRefund, ());
        } else {
            callData = abi.encodeCall(RugInstance.claimOpening, ());
        }
        vm.prank(actor);
        (bool ok,) = address(instance).call(callData);
        if (ok) doubleClaimSucceeded = true;
        _recordState();
    }

    function probeDoubleRug() external {
        if (instance.status() != IRugInstance.RugStatus.Rugged) return;
        vm.prank(creator);
        (bool ok,) = address(instance).call(abi.encodeCall(RugInstance.rug, (0, block.timestamp)));
        if (ok) doubleRugSucceeded = true;
        _recordState();
    }

    function _recordState() internal {
        uint8 currentStatus = uint8(instance.status());
        if (currentStatus < lastStatus) statusDecreased = true;
        lastStatus = currentStatus;

        if (
            currentStatus == uint8(IRugInstance.RugStatus.Active)
                || currentStatus == uint8(IRugInstance.RugStatus.Rugged)
        ) {
            (uint112 reserveToken, uint112 reserveQuote) = RugPool(instance.pool()).getReserves();
            uint256 currentK = uint256(reserveToken) * uint256(reserveQuote);
            if (lastK != 0 && currentK < lastK) kDecreased = true;
            lastK = currentK;
        }
    }
}

contract RugInvariantTest is StdInvariant, Test {
    RugHandler internal handler;

    function setUp() public {
        handler = new RugHandler();

        bytes4[] memory selectors = new bytes4[](12);
        selectors[0] = RugHandler.contribute.selector;
        selectors[1] = RugHandler.endOpening.selector;
        selectors[2] = RugHandler.finalize.selector;
        selectors[3] = RugHandler.claim.selector;
        selectors[4] = RugHandler.refund.selector;
        selectors[5] = RugHandler.withdrawFailedStake.selector;
        selectors[6] = RugHandler.endFounderLock.selector;
        selectors[7] = RugHandler.buy.selector;
        selectors[8] = RugHandler.sell.selector;
        selectors[9] = RugHandler.rug.selector;
        selectors[10] = RugHandler.probeDoubleClaim.selector;
        selectors[11] = RugHandler.probeDoubleRug.selector;
        targetContract(address(handler));
        targetSelector(FuzzSelector({ addr: address(handler), selectors: selectors }));
    }

    function invariant_WbnbIsConserved() public view {
        MockWBNB wbnb = handler.wbnb();
        RugInstance instance = handler.instance();
        uint256 accounted = wbnb.balanceOf(address(instance)) + wbnb.balanceOf(handler.creator())
            + wbnb.balanceOf(handler.treasury()) + wbnb.balanceOf(address(handler));
        if (instance.pool() != address(0)) accounted += wbnb.balanceOf(instance.pool());
        for (uint256 i; i < handler.actorCount(); ++i) {
            accounted += wbnb.balanceOf(handler.actorAt(i));
        }
        assertEq(accounted, wbnb.totalSupply());
    }

    function invariant_TokenIsConservedAndFounderNeverMovesToCreator() public view {
        RugInstance instance = handler.instance();
        if (instance.token() == address(0)) return;
        RugToken token = RugToken(instance.token());
        uint256 accounted = token.balanceOf(address(instance)) + token.balanceOf(instance.pool())
            + token.balanceOf(handler.creator()) + token.balanceOf(handler.treasury())
            + token.balanceOf(address(handler));
        for (uint256 i; i < handler.actorCount(); ++i) {
            accounted += token.balanceOf(handler.actorAt(i));
        }
        assertEq(accounted, token.totalSupply());
        assertEq(token.balanceOf(handler.creator()), 0);
    }

    function invariant_CanonicalSwapsKeepReservesEqualToBalances() public view {
        RugInstance instance = handler.instance();
        if (instance.pool() == address(0)) return;
        RugPool pool = RugPool(instance.pool());
        (uint112 reserveToken, uint112 reserveQuote) = pool.getReserves();
        assertEq(RugToken(instance.token()).balanceOf(address(pool)), uint256(reserveToken));
        assertEq(handler.wbnb().balanceOf(address(pool)), uint256(reserveQuote));
    }

    function invariant_EconomicAllocationsRemainConsistent() public view {
        RugInstance instance = handler.instance();
        IRugInstance.RugStatus current = instance.status();
        if (current != IRugInstance.RugStatus.Active && current != IRugInstance.RugStatus.Rugged) {
            return;
        }
        assertEq(
            instance.founderRemaining() + instance.openingTokenAllocation()
                + instance.poolTokenReserve(),
            current == IRugInstance.RugStatus.Active
                ? instance.tokenTotalSupply()
                : instance.tokenTotalSupply() - 450_000 ether
        );
        if (current == IRugInstance.RugStatus.Active) {
            assertEq(instance.founderRemaining(), 450_000 ether);
        }
        if (current == IRugInstance.RugStatus.Rugged) assertEq(instance.founderRemaining(), 0);
    }

    function invariant_ProtocolFeesOnlyAccrueToTreasury() public view {
        assertEq(handler.wbnb().balanceOf(handler.treasury()), handler.protocolFeesObserved());
    }

    function invariant_StatusAndConstantProductNeverDecrease() public view {
        assertFalse(handler.statusDecreased());
        assertFalse(handler.kDecreased());
    }

    function invariant_ClaimsAndRugCannotExecuteTwice() public view {
        assertFalse(handler.doubleClaimSucceeded());
        assertFalse(handler.doubleRugSucceeded());
    }
}
