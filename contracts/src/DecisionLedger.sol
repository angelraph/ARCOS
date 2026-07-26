// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Append-only, events-based log of every autonomous agent decision in ARCOS.
/// @dev Deliberately simple: no complex on-chain storage. The full rationale text lives
///      off-chain (Supabase); only its hash is pinned here. The dashboard recomputes the
///      hash client-side and checks it against `rationaleHash` — a concrete, verifiable
///      proof that the recorded decision matches what the agent actually reasoned.
contract DecisionLedger is Ownable {
    enum ActionType {
        TREASURY_ALLOCATION,
        PROCUREMENT_ORDER,
        SUPPLIER_QUOTE,
        ESCROW_OPEN,
        ESCROW_RELEASE,
        GOVERNANCE_OVERRIDE
    }

    event DecisionRecorded(
        uint256 indexed decisionId,
        bytes32 indexed agentId,
        ActionType actionType,
        bytes32 rationaleHash,
        bytes32 txRef,
        uint256 timestamp,
        address recordedBy
    );

    event AgentAuthorizationChanged(address indexed agent, bool authorized);

    error AgentNotAuthorized(address agent);

    mapping(address => bool) public authorizedAgents;
    uint256 public decisionCount;

    constructor(address initialOwner) Ownable(initialOwner) {}

    modifier onlyAuthorizedAgent() {
        if (!authorizedAgents[msg.sender]) revert AgentNotAuthorized(msg.sender);
        _;
    }

    /// @param agentId Readable agent identifier, e.g. keccak256("TREASURY_AGENT").
    /// @param actionType The category of decision being recorded.
    /// @param rationaleHash keccak256 of the off-chain rationale JSON stored in Supabase.
    /// @param txRef Hash of the related settlement/escrow transaction, for cross-referencing
    ///        a decision to the on-chain action it describes.
    function recordDecision(bytes32 agentId, ActionType actionType, bytes32 rationaleHash, bytes32 txRef)
        external
        onlyAuthorizedAgent
        returns (uint256 decisionId)
    {
        decisionId = decisionCount;
        decisionCount = decisionId + 1;

        emit DecisionRecorded(decisionId, agentId, actionType, rationaleHash, txRef, block.timestamp, msg.sender);
    }

    function setAgentAuthorization(address agent, bool authorized) external onlyOwner {
        authorizedAgents[agent] = authorized;
        emit AgentAuthorizationChanged(agent, authorized);
    }
}
