// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { RugMath } from "../src/libraries/RugMath.sol";

contract RugMathHarness {
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut, uint16 feeBps)
        external
        pure
        returns (uint256)
    {
        return RugMath.getAmountOut(amountIn, reserveIn, reserveOut, feeBps);
    }
}

contract RugMathTest is Test {
    function testOpeningConservationAndPrice() public pure {
        uint256 t = 1_000_000_000 ether;
        uint256 c = 10 ether;
        uint256 q = 5 ether;
        uint256 f = RugMath.founderAllocation(t, 4_500);
        uint256 n = t - f;
        uint256 a = RugMath.openingTokenAllocation(n, c, q);
        uint256 x = n - a;
        uint256 y = c + q;

        assertEq(f + a + x, t);
        assertGe(q * x, y * a);
    }

    function testFuzzOpeningPriceNotBelowPool(
        uint96 creatorStake,
        uint96 userContrib,
        uint16 founderBps,
        uint96 capSeed
    ) public pure {
        uint256 c = bound(uint256(creatorStake), 1e12, 1e24);
        uint256 u = bound(uint256(userContrib), 1e12, 1e24);
        uint256 cap = bound(uint256(capSeed), 1e12, 1e24);
        uint16 fBps = uint16(bound(uint256(founderBps), 1_000, 7_000));
        uint256 t = 1_000_000_000 ether;
        uint256 f = RugMath.founderAllocation(t, fBps);
        uint256 n = t - f;
        uint256 q = RugMath.openingAccepted(u, cap);
        uint256 a = RugMath.openingTokenAllocation(n, c, q);
        uint256 x = n - a;
        uint256 y = c + q;

        assertEq(f + a + x, t);
        assertGt(a, 0);
        assertGt(x, 0);
        assertGe(q * x, y * a);
    }

    function testFuzzClaimSumsDoNotExceedAllocations(
        uint96 first,
        uint96 second,
        uint96 third,
        uint96 allocationSeed,
        uint96 acceptedSeed
    ) public pure {
        uint256[3] memory users = [
            bound(uint256(first), 1, 1e24),
            bound(uint256(second), 1, 1e24),
            bound(uint256(third), 1, 1e24)
        ];
        uint256 total = users[0] + users[1] + users[2];
        uint256 allocation = bound(uint256(allocationSeed), 1, 1e27);
        uint256 accepted = bound(uint256(acceptedSeed), 0, total);
        uint256 tokens;
        uint256 refunds;

        for (uint256 i; i < users.length; ++i) {
            tokens += allocation * users[i] / total;
            refunds += (total - accepted) * users[i] / total;
        }

        assertLe(tokens, allocation);
        assertLe(refunds, total - accepted);
    }

    function testProtocolFeeUsesQuoteAmount() public pure {
        assertEq(RugMath.feeAmount(10 ether, 5), 0.005 ether);
        assertEq(RugMath.feeAmount(1, 5), 0);
    }

    function testAmmOutputIsMonotonicAndNonZero() public pure {
        uint256 small = RugMath.getAmountOut(1 ether, 100 ether, 200 ether, 25);
        uint256 large = RugMath.getAmountOut(2 ether, 100 ether, 200 ether, 25);
        assertGt(large, small);
        assertLt(large, 200 ether);
    }

    function testAmmRejectsRoundedZeroOutput() public {
        RugMathHarness harness = new RugMathHarness();
        vm.expectRevert(RugMath.ZeroAmount.selector);
        harness.getAmountOut(1, type(uint112).max, 1, 25);
    }
}
