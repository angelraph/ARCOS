// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Splits incoming USDC into policy-defined buckets and gates any spend above
///         `spendThreshold` behind a governance approval. Arc's commerce USDC is the ERC-20
///         token (6 decimals) at 0x3600...0000 — NOT the native 18-decimal gas token — so
///         payments are pulled via `transferFrom`, not received as native value.
contract TreasuryPolicy is Ownable {
    using SafeERC20 for IERC20;

    struct Bucket {
        string name;
        uint16 bps; // basis points of each incoming payment allocated to this bucket
        uint256 balance;
    }

    struct PendingSpend {
        address to;
        uint256 amount;
        uint8 bucketIndex;
        bytes32 rationaleHash;
        bool approved;
        bool executed;
    }

    uint8 public constant BUCKET_COUNT = 4; // Tax, Payroll, Operating, Procurement

    IERC20 public immutable usdc;
    address public governance;
    uint256 public spendThreshold;

    Bucket[BUCKET_COUNT] public buckets;
    mapping(uint256 => PendingSpend) public pendingSpends;
    uint256 public pendingSpendCount;
    mapping(address => bool) public authorizedAgents;

    event PaymentReceived(address indexed from, uint256 amount);
    event BucketAllocated(uint8 indexed bucketIndex, uint256 amount, uint256 newBalance);
    event SpendProposed(uint256 indexed spendId, uint8 indexed bucketIndex, uint256 amount, address to, bytes32 rationaleHash);
    event SpendApproved(uint256 indexed spendId);
    event SpendExecuted(uint256 indexed spendId, uint8 indexed bucketIndex, uint256 amount, address to);
    event AgentAuthorizationChanged(address indexed agent, bool authorized);
    event GovernanceUpdated(address indexed oldGovernance, address indexed newGovernance);
    event SpendThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);

    error AgentNotAuthorized(address agent);
    error CallerNotGovernance();
    error InvalidBucketIndex(uint8 bucketIndex);
    error BpsMustSumTo10000();
    error InsufficientBucketBalance(uint8 bucketIndex, uint256 requested, uint256 available);
    error SpendAlreadyExecuted(uint256 spendId);
    error SpendRequiresGovernanceApproval(uint256 spendId);

    constructor(
        address initialOwner,
        address _usdc,
        address _governance,
        string[BUCKET_COUNT] memory bucketNames,
        uint16[BUCKET_COUNT] memory bucketBps,
        uint256 _spendThreshold
    ) Ownable(initialOwner) {
        uint16 total;
        for (uint8 i = 0; i < BUCKET_COUNT; i++) {
            total += bucketBps[i];
            buckets[i] = Bucket({name: bucketNames[i], bps: bucketBps[i], balance: 0});
        }
        if (total != 10_000) revert BpsMustSumTo10000();

        usdc = IERC20(_usdc);
        governance = _governance;
        spendThreshold = _spendThreshold;
    }

    modifier onlyAuthorizedAgent() {
        if (!authorizedAgents[msg.sender]) revert AgentNotAuthorized(msg.sender);
        _;
    }

    modifier onlyGovernance() {
        if (msg.sender != governance) revert CallerNotGovernance();
        _;
    }

    /// @notice Pulls `amount` USDC from the caller and allocates it across buckets by bps.
    ///         Caller must have approved this contract for at least `amount` beforehand.
    function receivePayment(uint256 amount) external {
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit PaymentReceived(msg.sender, amount);
        _allocate(amount);
    }

    function _allocate(uint256 amount) internal {
        uint256 allocated;
        for (uint8 i = 0; i < BUCKET_COUNT; i++) {
            // last bucket absorbs any rounding remainder so the full amount is always allocated
            uint256 share = i == BUCKET_COUNT - 1 ? amount - allocated : (amount * buckets[i].bps) / 10_000;
            allocated += share;
            buckets[i].balance += share;
            emit BucketAllocated(i, share, buckets[i].balance);
        }
    }

    /// @notice An agent proposes a spend from a bucket. Auto-executes if `amount` is at or
    ///         under `spendThreshold`; otherwise waits for `approveSpend` from governance.
    function proposeSpend(uint8 bucketIndex, uint256 amount, address to, bytes32 rationaleHash)
        external
        onlyAuthorizedAgent
        returns (uint256 spendId)
    {
        if (bucketIndex >= BUCKET_COUNT) revert InvalidBucketIndex(bucketIndex);
        if (buckets[bucketIndex].balance < amount) {
            revert InsufficientBucketBalance(bucketIndex, amount, buckets[bucketIndex].balance);
        }

        spendId = pendingSpendCount;
        pendingSpendCount = spendId + 1;
        pendingSpends[spendId] = PendingSpend({
            to: to,
            amount: amount,
            bucketIndex: bucketIndex,
            rationaleHash: rationaleHash,
            approved: false,
            executed: false
        });

        emit SpendProposed(spendId, bucketIndex, amount, to, rationaleHash);

        if (amount <= spendThreshold) {
            _executeSpend(spendId);
        }
    }

    /// @notice Governance-gated approval for any spend above `spendThreshold`.
    function approveSpend(uint256 spendId) external onlyGovernance {
        PendingSpend storage s = pendingSpends[spendId];
        if (s.executed) revert SpendAlreadyExecuted(spendId);
        s.approved = true;
        emit SpendApproved(spendId);
        _executeSpend(spendId);
    }

    function _executeSpend(uint256 spendId) internal {
        PendingSpend storage s = pendingSpends[spendId];
        if (s.executed) revert SpendAlreadyExecuted(spendId);
        if (s.amount > spendThreshold && !s.approved) revert SpendRequiresGovernanceApproval(spendId);

        s.executed = true;
        buckets[s.bucketIndex].balance -= s.amount;
        usdc.safeTransfer(s.to, s.amount);

        emit SpendExecuted(spendId, s.bucketIndex, s.amount, s.to);
    }

    function bucketBalance(uint8 bucketIndex) external view returns (uint256) {
        if (bucketIndex >= BUCKET_COUNT) revert InvalidBucketIndex(bucketIndex);
        return buckets[bucketIndex].balance;
    }

    function setAgentAuthorization(address agent, bool authorized) external onlyOwner {
        authorizedAgents[agent] = authorized;
        emit AgentAuthorizationChanged(agent, authorized);
    }

    function setGovernance(address newGovernance) external onlyOwner {
        emit GovernanceUpdated(governance, newGovernance);
        governance = newGovernance;
    }

    function setSpendThreshold(uint256 newThreshold) external onlyOwner {
        emit SpendThresholdUpdated(spendThreshold, newThreshold);
        spendThreshold = newThreshold;
    }
}
