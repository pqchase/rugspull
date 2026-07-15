// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { MockWBNB } from "./MockWBNB.sol";
import { RugFactory } from "../src/RugFactory.sol";
import { RugInstance } from "../src/RugInstance.sol";
import { RugPool } from "../src/RugPool.sol";
import { RugToken } from "../src/RugToken.sol";
import { IRugFactory } from "../src/interfaces/IRugFactory.sol";
import { IRugInstance } from "../src/interfaces/IRugInstance.sol";

contract RugScenarioTest is Test {
    MockWBNB internal wbnb;
    RugFactory internal factory;
    address internal creator = address(0xC0FFEE);
    address internal treasury = address(0x777);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        wbnb = new MockWBNB();
        factory = new RugFactory(
            RugFactory.FactoryConfig({
                wbnb: address(wbnb),
                protocolTreasury: treasury,
                initialOwner: address(this),
                founderBps: 4500,
                swapFeeBps: 25,
                protocolFeeBps: 5,
                minLaunchBps: 3000,
                openingCapBps: 5000,
                openingDuration: 1 days,
                founderUnlockDelay: 2 days,
                creationFee: 0.003 ether,
                minCreatorStake: 0.1 ether,
                tokenTotalSupply: 1_000_000 ether
            })
        );
        wbnb.mint(creator, 30 ether);
        wbnb.mint(alice, 20 ether);
        wbnb.mint(bob, 20 ether);
    }

    function _create(string memory name, string memory symbol) internal returns (RugInstance rug) {
        IRugFactory.CreateRugParams memory params = IRugFactory.CreateRugParams({
            name: name,
            symbol: symbol,
            metadataURI: "ipfs://scenario",
            metadataHash: keccak256(bytes(name)),
            creatorStake: 10 ether
        });
        vm.startPrank(creator);
        wbnb.approve(address(factory), type(uint256).max);
        rug = RugInstance(factory.createRug(params));
        vm.stopPrank();
    }

    function _contribute(RugInstance rug, address user, uint256 amount) internal {
        vm.startPrank(user);
        wbnb.approve(address(rug), type(uint256).max);
        rug.contribute(amount);
        vm.stopPrank();
    }

    function testScenario_FailedLaunchRefundsEveryoneAndKeepsOnlyCreationFee() public {
        RugInstance rug = _create("Nobody Came", "EMPTY");
        _contribute(rug, alice, 2 ether);
        vm.warp(rug.openingEnd());
        rug.finalize();

        assertEq(uint256(rug.status()), uint256(IRugInstance.RugStatus.Failed));
        vm.prank(alice);
        rug.claimFailedRefund();
        vm.prank(creator);
        rug.withdrawCreatorStakeAfterFailure();

        assertEq(wbnb.balanceOf(address(rug)), 0);
        assertEq(wbnb.balanceOf(treasury), 0.003 ether);
        assertEq(wbnb.balanceOf(address(factory)), 0);
        assertEq(
            wbnb.balanceOf(creator) + wbnb.balanceOf(alice) + wbnb.balanceOf(bob)
                + wbnb.balanceOf(treasury),
            wbnb.totalSupply()
        );
    }

    function testScenario_SuccessfulLaunchTradesFeesRugAndContinuesTrading() public {
        RugInstance rug = _create("Public Bad Idea", "OOPS");
        _contribute(rug, alice, 4 ether);
        _contribute(rug, bob, 4 ether);
        vm.warp(rug.openingEnd());
        rug.finalize();

        assertEq(uint256(rug.status()), uint256(IRugInstance.RugStatus.Active));
        assertEq(rug.acceptedContribution(), 5 ether);
        assertEq(rug.founderRemaining(), 450_000 ether);

        vm.prank(alice);
        rug.claimOpening();
        vm.prank(bob);
        rug.claimOpening();

        RugPool pool = RugPool(rug.pool());
        RugToken token = RugToken(rug.token());
        uint256 treasuryAfterCreation = wbnb.balanceOf(treasury);

        vm.startPrank(bob);
        wbnb.approve(address(pool), 1 ether);
        pool.buyExactQuoteForTokens(1 ether, 1, bob, block.timestamp);
        vm.stopPrank();
        assertGt(wbnb.balanceOf(treasury), treasuryAfterCreation);

        uint256 treasuryAfterBuy = wbnb.balanceOf(treasury);
        vm.startPrank(alice);
        token.approve(address(pool), 1_000 ether);
        pool.sellExactTokensForQuote(1_000 ether, 1, alice, block.timestamp);
        vm.stopPrank();
        assertGt(wbnb.balanceOf(treasury), treasuryAfterBuy);

        uint256 treasuryBeforeRug = wbnb.balanceOf(treasury);
        vm.warp(rug.founderUnlockTime());
        vm.prank(creator);
        rug.rug(1, block.timestamp);
        assertEq(uint256(rug.status()), uint256(IRugInstance.RugStatus.Rugged));
        assertEq(rug.founderRemaining(), 0);
        assertEq(token.balanceOf(creator), 0);
        assertGt(wbnb.balanceOf(treasury), treasuryBeforeRug);

        vm.startPrank(bob);
        wbnb.approve(address(pool), 0.1 ether);
        uint256 postRugTokens = pool.buyExactQuoteForTokens(0.1 ether, 1, bob, block.timestamp);
        vm.stopPrank();
        assertGt(postRugTokens, 0);

        (uint112 reserveToken, uint112 reserveQuote) = pool.getReserves();
        assertEq(token.balanceOf(address(pool)), uint256(reserveToken));
        assertEq(wbnb.balanceOf(address(pool)), uint256(reserveQuote));

        _assertConservation(rug, pool, token);
    }

    function _assertConservation(RugInstance rug, RugPool pool, RugToken token) internal view {
        uint256 tokenAccounted = token.balanceOf(address(rug)) + token.balanceOf(address(pool))
            + token.balanceOf(creator) + token.balanceOf(alice) + token.balanceOf(bob)
            + token.balanceOf(treasury) + token.balanceOf(address(factory));
        assertEq(tokenAccounted, token.totalSupply());

        uint256 wbnbAccounted = wbnb.balanceOf(address(rug)) + wbnb.balanceOf(address(pool))
            + wbnb.balanceOf(creator) + wbnb.balanceOf(alice) + wbnb.balanceOf(bob)
            + wbnb.balanceOf(treasury) + wbnb.balanceOf(address(factory));
        assertEq(wbnbAccounted, wbnb.totalSupply());
    }
}
