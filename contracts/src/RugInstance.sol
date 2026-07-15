// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IRugInstance } from "./interfaces/IRugInstance.sol";
import { RugPool } from "./RugPool.sol";
import { RugToken } from "./RugToken.sol";
import { RugMath } from "./libraries/RugMath.sol";
import { TransferLib } from "./libraries/TransferLib.sol";

contract RugInstance is IRugInstance {
    using TransferLib for address;

    address public immutable factory;
    address public immutable creator;
    address public immutable WBNB;
    address public immutable protocolTreasury;

    RugStatus public status;

    uint256 public immutable creatorStake;
    uint256 public immutable minLaunchAmount;
    uint256 public immutable openingCap;
    uint40 public immutable openingStart;
    uint40 public immutable openingEnd;
    uint40 public immutable founderUnlockTime;
    uint16 public immutable founderBps;
    uint16 public immutable swapFeeBps;
    uint16 public immutable protocolFeeBps;
    uint256 public immutable tokenTotalSupply;

    uint256 public totalContributed;
    mapping(address => uint256) public contributionOf;
    mapping(address => bool) public claimed;

    address public token;
    address public pool;

    uint256 public acceptedContribution;
    uint256 public openingTokenAllocation;
    uint256 public poolTokenReserve;
    uint256 public poolQuoteReserve;
    uint256 public founderRemaining;

    bytes32 public immutable metadataHash;
    string public metadataURI;
    bytes32 public immutable disclosureHash;

    string private tokenName;
    string private tokenSymbol;
    bool public creatorStakeWithdrawn;
    uint256 private locked = 1;

    error NotFactory();
    error NotCreator();
    error BadStatus();
    error OpeningEnded();
    error OpeningNotEnded();
    error ZeroAmount();
    error AlreadyClaimed();
    error NothingToClaim();
    error AlreadyWithdrawn();
    error FounderLocked();
    error NoFounderRemaining();
    error CreatorCannotContribute();
    error Reentrant();

    modifier nonReentrant() {
        if (locked != 1) revert Reentrant();
        locked = 2;
        _;
        locked = 1;
    }

    struct Config {
        address factory;
        address creator;
        address wbnb;
        address protocolTreasury;
        string name;
        string symbol;
        string metadataURI;
        bytes32 metadataHash;
        bytes32 disclosureHash;
        uint256 creatorStake;
        uint16 founderBps;
        uint16 swapFeeBps;
        uint16 protocolFeeBps;
        uint16 minLaunchBps;
        uint16 openingCapBps;
        uint40 openingDuration;
        uint40 founderUnlockDelay;
        uint256 tokenTotalSupply;
    }

    constructor(Config memory config) {
        factory = config.factory;
        creator = config.creator;
        WBNB = config.wbnb;
        protocolTreasury = config.protocolTreasury;
        creatorStake = config.creatorStake;
        minLaunchAmount = config.creatorStake * config.minLaunchBps / RugMath.BPS_DENOMINATOR;
        openingCap = config.creatorStake * config.openingCapBps / RugMath.BPS_DENOMINATOR;
        openingStart = uint40(block.timestamp);
        openingEnd = uint40(block.timestamp) + config.openingDuration;
        founderUnlockTime =
            uint40(block.timestamp) + config.openingDuration + config.founderUnlockDelay;
        founderBps = config.founderBps;
        swapFeeBps = config.swapFeeBps;
        protocolFeeBps = config.protocolFeeBps;
        tokenTotalSupply = config.tokenTotalSupply;
        metadataHash = config.metadataHash;
        metadataURI = config.metadataURI;
        disclosureHash = config.disclosureHash;
        tokenName = config.name;
        tokenSymbol = config.symbol;
    }

    function contribute(uint256 amount) external nonReentrant {
        if (status != RugStatus.Opening) revert BadStatus();
        if (block.timestamp >= openingEnd) revert OpeningEnded();
        if (msg.sender == creator) revert CreatorCannotContribute();
        if (amount == 0) revert ZeroAmount();
        contributionOf[msg.sender] += amount;
        totalContributed += amount;
        WBNB.safeTransferFrom(msg.sender, address(this), amount);
        emit Contributed(address(this), msg.sender, amount);
    }

    function finalize() external nonReentrant {
        if (status != RugStatus.Opening) revert BadStatus();
        if (block.timestamp < openingEnd) revert OpeningNotEnded();

        if (totalContributed < minLaunchAmount) {
            status = RugStatus.Failed;
            emit LaunchFailed(address(this), totalContributed, minLaunchAmount);
            return;
        }

        uint256 q = RugMath.openingAccepted(totalContributed, openingCap);
        uint256 f = RugMath.founderAllocation(tokenTotalSupply, founderBps);
        uint256 n = tokenTotalSupply - f;
        uint256 a = RugMath.openingTokenAllocation(n, creatorStake, q);
        uint256 x = n - a;
        uint256 y = creatorStake + q;

        acceptedContribution = q;
        openingTokenAllocation = a;
        poolTokenReserve = x;
        poolQuoteReserve = y;
        founderRemaining = f;

        RugToken createdToken =
            new RugToken(tokenName, tokenSymbol, address(this), tokenTotalSupply);
        RugPool createdPool = new RugPool(
            address(createdToken), WBNB, address(this), protocolTreasury, swapFeeBps, protocolFeeBps
        );
        token = address(createdToken);
        pool = address(createdPool);
        status = RugStatus.Active;

        token.safeTransfer(pool, x);
        WBNB.safeTransfer(pool, y);
        createdPool.initialize(x, y);

        emit LaunchSucceeded(address(this), token, pool, totalContributed, q, a, x, y, f);
    }

    function claimOpening() external nonReentrant {
        if (status != RugStatus.Active && status != RugStatus.Rugged) revert BadStatus();
        if (claimed[msg.sender]) revert AlreadyClaimed();
        uint256 u = contributionOf[msg.sender];
        if (u == 0) revert NothingToClaim();
        claimed[msg.sender] = true;

        uint256 tokenAmount = openingTokenAllocation * u / totalContributed;
        uint256 refundAmount = (totalContributed - acceptedContribution) * u / totalContributed;
        if (tokenAmount != 0) token.safeTransfer(msg.sender, tokenAmount);
        if (refundAmount != 0) WBNB.safeTransfer(msg.sender, refundAmount);
        emit ClaimedOpening(address(this), msg.sender, tokenAmount, refundAmount);
    }

    function claimFailedRefund() external nonReentrant {
        if (status != RugStatus.Failed) revert BadStatus();
        if (claimed[msg.sender]) revert AlreadyClaimed();
        uint256 amount = contributionOf[msg.sender];
        if (amount == 0) revert NothingToClaim();
        claimed[msg.sender] = true;
        WBNB.safeTransfer(msg.sender, amount);
        emit ClaimedFailedRefund(address(this), msg.sender, amount);
    }

    function withdrawCreatorStakeAfterFailure() external nonReentrant {
        if (msg.sender != creator) revert NotCreator();
        if (status != RugStatus.Failed) revert BadStatus();
        if (creatorStakeWithdrawn) revert AlreadyWithdrawn();
        creatorStakeWithdrawn = true;
        WBNB.safeTransfer(creator, creatorStake);
        emit CreatorStakeWithdrawn(address(this), creator, creatorStake);
    }

    function rug(uint256 minQuoteOut, uint256 deadline)
        external
        nonReentrant
        returns (uint256 quoteOut)
    {
        if (msg.sender != creator) revert NotCreator();
        if (status != RugStatus.Active) revert BadStatus();
        if (block.timestamp < founderUnlockTime) revert FounderLocked();
        uint256 amount = founderRemaining;
        if (amount == 0) revert NoFounderRemaining();
        founderRemaining = 0;
        status = RugStatus.Rugged;
        token.safeTransfer(pool, amount);
        quoteOut = RugPool(pool).sellFromRugInstance(amount, minQuoteOut, creator, deadline);
        emit RugPulled(address(this), creator, amount, quoteOut);
    }
}
