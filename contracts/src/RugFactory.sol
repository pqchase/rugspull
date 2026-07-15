// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IRugFactory } from "./interfaces/IRugFactory.sol";
import { RugInstance } from "./RugInstance.sol";
import { RugMath } from "./libraries/RugMath.sol";
import { TransferLib } from "./libraries/TransferLib.sol";

contract RugFactory is IRugFactory {
    using TransferLib for address;

    address public immutable WBNB;
    address public immutable protocolTreasury;
    uint16 public immutable founderBps;
    uint16 public immutable swapFeeBps;
    uint16 public immutable protocolFeeBps;
    uint16 public immutable minLaunchBps;
    uint16 public immutable openingCapBps;
    uint40 public immutable openingDuration;
    uint40 public immutable founderUnlockDelay;
    uint256 public immutable creationFee;
    uint256 public immutable minCreatorStake;
    uint256 public immutable tokenTotalSupply;
    string public constant VERSION = "0.4.0-bsc-mvp";
    string public constant DISCLOSURE =
        "Rugspull v0.4: after unlock, the creator may irreversibly sell the entire founder allocation into the canonical pool; liquidity cannot be withdrawn; trading continues after Rugged.";
    bytes32 public constant DISCLOSURE_HASH = keccak256(
        "Rugspull v0.4: after unlock, the creator may irreversibly sell the entire founder allocation into the canonical pool; liquidity cannot be withdrawn; trading continues after Rugged."
    );

    address public owner;
    address public pendingOwner;
    bool public createPaused;
    address[] public allRugs;
    uint256 private locked = 1;

    error NotOwner();
    error CreatePaused();
    error BadAddress();
    error BadConfig();
    error ZeroStake();
    error StakeBelowMinimum();
    error StakeTooLarge();
    error BadMetadata();
    error NotPendingOwner();
    error Reentrant();

    event CreatePausedSet(bool paused);
    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    struct FactoryConfig {
        address wbnb;
        address protocolTreasury;
        address initialOwner;
        uint16 founderBps;
        uint16 swapFeeBps;
        uint16 protocolFeeBps;
        uint16 minLaunchBps;
        uint16 openingCapBps;
        uint40 openingDuration;
        uint40 founderUnlockDelay;
        uint256 creationFee;
        uint256 minCreatorStake;
        uint256 tokenTotalSupply;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (locked != 1) revert Reentrant();
        locked = 2;
        _;
        locked = 1;
    }

    constructor(FactoryConfig memory config) {
        if (
            config.wbnb == address(0) || config.wbnb.code.length == 0
                || config.protocolTreasury == address(0) || config.initialOwner == address(0)
        ) {
            revert BadAddress();
        }
        if (
            config.founderBps == 0 || config.founderBps >= RugMath.BPS_DENOMINATOR
                || uint256(config.swapFeeBps) + config.protocolFeeBps > 1_000
                || config.minLaunchBps == 0 || config.minLaunchBps > RugMath.BPS_DENOMINATOR
                || config.openingCapBps == 0 || config.openingCapBps > RugMath.BPS_DENOMINATOR
                || config.minLaunchBps > config.openingCapBps
        ) {
            revert BadConfig();
        }
        if (
            config.openingDuration == 0 || config.founderUnlockDelay == 0
                || config.minCreatorStake == 0 || config.minCreatorStake > type(uint112).max
                || config.tokenTotalSupply == 0 || config.tokenTotalSupply > type(uint112).max
                || uint256(block.timestamp) + config.openingDuration + config.founderUnlockDelay
                    > type(uint40).max
        ) revert BadConfig();
        uint256 founderAllocation =
            RugMath.founderAllocation(config.tokenTotalSupply, config.founderBps);
        if (
            founderAllocation == 0 || founderAllocation == config.tokenTotalSupply
                || config.minCreatorStake * config.minLaunchBps / RugMath.BPS_DENOMINATOR == 0
                || config.minCreatorStake * config.openingCapBps / RugMath.BPS_DENOMINATOR == 0
        ) revert BadConfig();
        WBNB = config.wbnb;
        protocolTreasury = config.protocolTreasury;
        founderBps = config.founderBps;
        swapFeeBps = config.swapFeeBps;
        protocolFeeBps = config.protocolFeeBps;
        minLaunchBps = config.minLaunchBps;
        openingCapBps = config.openingCapBps;
        openingDuration = config.openingDuration;
        founderUnlockDelay = config.founderUnlockDelay;
        creationFee = config.creationFee;
        minCreatorStake = config.minCreatorStake;
        tokenTotalSupply = config.tokenTotalSupply;
        owner = config.initialOwner;
        emit OwnershipTransferred(address(0), config.initialOwner);
    }

    function allRugsLength() external view returns (uint256) {
        return allRugs.length;
    }

    function setCreatePaused(bool paused) external onlyOwner {
        createPaused = paused;
        emit CreatePausedSet(paused);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert BadAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        address oldOwner = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(oldOwner, msg.sender);
    }

    function createRug(CreateRugParams calldata params)
        external
        nonReentrant
        returns (address rug)
    {
        if (createPaused) revert CreatePaused();
        if (params.creatorStake == 0) revert ZeroStake();
        if (params.creatorStake < minCreatorStake) revert StakeBelowMinimum();
        if (params.creatorStake > type(uint112).max) revert StakeTooLarge();
        if (
            bytes(params.name).length == 0 || bytes(params.name).length > 64
                || bytes(params.symbol).length == 0 || bytes(params.symbol).length > 12
                || bytes(params.metadataURI).length == 0 || bytes(params.metadataURI).length > 512
                || params.metadataHash == bytes32(0)
        ) revert BadMetadata();
        uint256 maximumAccepted = params.creatorStake * openingCapBps / RugMath.BPS_DENOMINATOR;
        if (maximumAccepted > type(uint112).max - params.creatorStake) revert StakeTooLarge();

        WBNB.safeTransferFrom(msg.sender, address(this), params.creatorStake + creationFee);
        if (creationFee != 0) WBNB.safeTransfer(protocolTreasury, creationFee);

        RugInstance.Config memory config = RugInstance.Config({
            factory: address(this),
            creator: msg.sender,
            wbnb: WBNB,
            protocolTreasury: protocolTreasury,
            name: params.name,
            symbol: params.symbol,
            metadataURI: params.metadataURI,
            metadataHash: params.metadataHash,
            disclosureHash: DISCLOSURE_HASH,
            creatorStake: params.creatorStake,
            founderBps: founderBps,
            swapFeeBps: swapFeeBps,
            protocolFeeBps: protocolFeeBps,
            minLaunchBps: minLaunchBps,
            openingCapBps: openingCapBps,
            openingDuration: openingDuration,
            founderUnlockDelay: founderUnlockDelay,
            tokenTotalSupply: tokenTotalSupply
        });

        RugInstance instance = new RugInstance(config);
        rug = address(instance);
        allRugs.push(rug);
        WBNB.safeTransfer(rug, params.creatorStake);

        emit RugCreated(
            rug,
            msg.sender,
            params.name,
            params.symbol,
            params.creatorStake,
            instance.openingEnd(),
            params.metadataHash,
            DISCLOSURE_HASH
        );
    }
}
