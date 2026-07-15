// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { MockWBNB } from "./MockWBNB.sol";
import { RugFactory } from "../src/RugFactory.sol";
import { RugInstance } from "../src/RugInstance.sol";
import { IRugFactory } from "../src/interfaces/IRugFactory.sol";

contract RugFactoryTest is Test {
    MockWBNB internal wbnb;
    RugFactory internal factory;
    address internal treasury = address(0x777);
    address internal creator = address(0xC0FFEE);
    address internal newOwner = address(0xBEEF);

    function setUp() public {
        wbnb = new MockWBNB();
        factory = _deployWith(
            address(wbnb),
            treasury,
            address(this),
            4500,
            25,
            5,
            3000,
            5000,
            1 days,
            2 days,
            0.003 ether,
            0.1 ether,
            1_000_000_000 ether
        );
        wbnb.mint(creator, 100 ether);
    }

    function _params() internal pure returns (IRugFactory.CreateRugParams memory) {
        return IRugFactory.CreateRugParams({
            name: "Rug",
            symbol: "RUG",
            metadataURI: "ipfs://rug",
            metadataHash: bytes32("meta"),
            creatorStake: 10 ether
        });
    }

    function _deployWith(
        address wbnbAddress,
        address treasuryAddress,
        address initialOwner,
        uint16 founder,
        uint16 swapFee,
        uint16 protocolFee,
        uint16 minLaunch,
        uint16 openingCap,
        uint40 openingDuration,
        uint40 founderUnlockDelay,
        uint256 creationFee,
        uint256 minCreatorStake,
        uint256 supply
    ) internal returns (RugFactory) {
        return new RugFactory(
            RugFactory.FactoryConfig({
                wbnb: wbnbAddress,
                protocolTreasury: treasuryAddress,
                initialOwner: initialOwner,
                founderBps: founder,
                swapFeeBps: swapFee,
                protocolFeeBps: protocolFee,
                minLaunchBps: minLaunch,
                openingCapBps: openingCap,
                openingDuration: openingDuration,
                founderUnlockDelay: founderUnlockDelay,
                creationFee: creationFee,
                minCreatorStake: minCreatorStake,
                tokenTotalSupply: supply
            })
        );
    }

    function _create() internal returns (RugInstance rug) {
        vm.startPrank(creator);
        wbnb.approve(address(factory), type(uint256).max);
        rug = RugInstance(factory.createRug(_params()));
        vm.stopPrank();
    }

    function testCreateRugTransfersStakeAndCreationFee() public {
        uint256 beforeCreator = wbnb.balanceOf(creator);
        RugInstance rug = _create();

        assertEq(wbnb.balanceOf(address(rug)), 10 ether);
        assertEq(wbnb.balanceOf(treasury), 0.003 ether);
        assertEq(wbnb.balanceOf(creator), beforeCreator - 10.003 ether);
        assertEq(factory.allRugsLength(), 1);
        assertEq(factory.allRugs(0), address(rug));
    }

    function testImmutableV04ConfigAppliedToRugInstance() public {
        RugInstance rug = _create();

        assertEq(rug.creator(), creator);
        assertEq(rug.WBNB(), address(wbnb));
        assertEq(rug.protocolTreasury(), treasury);
        assertEq(rug.creatorStake(), 10 ether);
        assertEq(rug.minLaunchAmount(), 3 ether);
        assertEq(rug.openingCap(), 5 ether);
        assertEq(rug.founderBps(), 4500);
        assertEq(rug.swapFeeBps(), 25);
        assertEq(rug.protocolFeeBps(), 5);
        assertEq(rug.founderUnlockTime(), rug.openingEnd() + 2 days);
        assertEq(rug.tokenTotalSupply(), 1_000_000_000 ether);
        assertEq(rug.disclosureHash(), factory.DISCLOSURE_HASH());
    }

    function testRejectsStakeBelowMinimum() public {
        IRugFactory.CreateRugParams memory params = _params();
        params.creatorStake = 0.099 ether;

        vm.startPrank(creator);
        wbnb.approve(address(factory), type(uint256).max);
        vm.expectRevert(RugFactory.StakeBelowMinimum.selector);
        factory.createRug(params);
        vm.stopPrank();
    }

    function testRejectsCallerControlledOrMalformedMetadata() public {
        IRugFactory.CreateRugParams memory params = _params();
        params.metadataHash = bytes32(0);
        vm.prank(creator);
        vm.expectRevert(RugFactory.BadMetadata.selector);
        factory.createRug(params);

        params = _params();
        params.name = string(new bytes(65));
        vm.prank(creator);
        vm.expectRevert(RugFactory.BadMetadata.selector);
        factory.createRug(params);

        params = _params();
        params.symbol = string(new bytes(13));
        vm.prank(creator);
        vm.expectRevert(RugFactory.BadMetadata.selector);
        factory.createRug(params);

        params = _params();
        params.metadataURI = string(new bytes(513));
        vm.prank(creator);
        vm.expectRevert(RugFactory.BadMetadata.selector);
        factory.createRug(params);
    }

    function testOwnerCanPauseOnlyNewCreation() public {
        factory.setCreatePaused(true);
        vm.startPrank(creator);
        wbnb.approve(address(factory), type(uint256).max);
        vm.expectRevert(RugFactory.CreatePaused.selector);
        factory.createRug(_params());
        vm.stopPrank();

        factory.setCreatePaused(false);
        RugInstance rug = _create();
        factory.setCreatePaused(true);
        assertEq(rug.creatorStake(), 10 ether);
        assertEq(rug.minLaunchAmount(), 3 ether);
    }

    function testOwnershipTransferRequiresAcceptance() public {
        factory.transferOwnership(newOwner);
        assertEq(factory.owner(), address(this));
        assertEq(factory.pendingOwner(), newOwner);

        vm.prank(creator);
        vm.expectRevert(RugFactory.NotPendingOwner.selector);
        factory.acceptOwnership();

        vm.prank(newOwner);
        factory.acceptOwnership();
        assertEq(factory.owner(), newOwner);
        assertEq(factory.pendingOwner(), address(0));

        vm.expectRevert(RugFactory.NotOwner.selector);
        factory.setCreatePaused(true);
        vm.prank(newOwner);
        factory.setCreatePaused(true);
        assertTrue(factory.createPaused());
    }

    function testRejectsWbnbWithoutContractCodeAndZeroRoles() public {
        vm.expectRevert(RugFactory.BadAddress.selector);
        _deployWith(
            address(0x1234),
            treasury,
            address(this),
            4500,
            25,
            5,
            3000,
            5000,
            1 days,
            2 days,
            0.003 ether,
            0.1 ether,
            1_000_000_000 ether
        );

        vm.expectRevert(RugFactory.BadAddress.selector);
        _deployWith(
            address(wbnb),
            address(0),
            address(this),
            4500,
            25,
            5,
            3000,
            5000,
            1 days,
            2 days,
            0.003 ether,
            0.1 ether,
            1_000_000_000 ether
        );

        vm.expectRevert(RugFactory.BadAddress.selector);
        _deployWith(
            address(wbnb),
            treasury,
            address(0),
            4500,
            25,
            5,
            3000,
            5000,
            1 days,
            2 days,
            0.003 ether,
            0.1 ether,
            1_000_000_000 ether
        );
    }

    function testRejectsBrickingBpsConfigs() public {
        vm.expectRevert(RugFactory.BadConfig.selector);
        _deployWith(
            address(wbnb),
            treasury,
            address(this),
            10_000,
            25,
            5,
            3000,
            5000,
            1 days,
            2 days,
            0.003 ether,
            0.1 ether,
            1_000_000_000 ether
        );

        vm.expectRevert(RugFactory.BadConfig.selector);
        _deployWith(
            address(wbnb),
            treasury,
            address(this),
            4500,
            996,
            5,
            3000,
            5000,
            1 days,
            2 days,
            0.003 ether,
            0.1 ether,
            1_000_000_000 ether
        );

        vm.expectRevert(RugFactory.BadConfig.selector);
        _deployWith(
            address(wbnb),
            treasury,
            address(this),
            4500,
            25,
            5,
            5001,
            5000,
            1 days,
            2 days,
            0.003 ether,
            0.1 ether,
            1_000_000_000 ether
        );
    }

    function testRejectsSupplyStakeAndTimestampOverflows() public {
        vm.expectRevert(RugFactory.BadConfig.selector);
        _deployWith(
            address(wbnb),
            treasury,
            address(this),
            4500,
            25,
            5,
            3000,
            5000,
            1 days,
            2 days,
            0.003 ether,
            0.1 ether,
            uint256(type(uint112).max) + 1
        );

        uint256 oversizedStake = uint256(type(uint112).max) * 2 / 3 + 1;
        wbnb.mint(creator, oversizedStake);
        IRugFactory.CreateRugParams memory params = _params();
        params.creatorStake = oversizedStake;
        vm.startPrank(creator);
        wbnb.approve(address(factory), type(uint256).max);
        vm.expectRevert(RugFactory.StakeTooLarge.selector);
        factory.createRug(params);
        vm.stopPrank();

        vm.expectRevert(RugFactory.BadConfig.selector);
        _deployWith(
            address(wbnb),
            treasury,
            address(this),
            4500,
            25,
            5,
            3000,
            5000,
            type(uint40).max,
            1,
            0.003 ether,
            0.1 ether,
            1_000_000_000 ether
        );
    }
}
