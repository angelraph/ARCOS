// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import "../src/DecisionLedger.sol";

contract DecisionLedgerTest is Test {
    DecisionLedger ledger;
    address owner = address(0xA11CE);
    address agent = address(0xBEEF);
    address stranger = address(0xC0FFEE);

    event DecisionRecorded(
        uint256 indexed decisionId,
        bytes32 indexed agentId,
        DecisionLedger.ActionType actionType,
        bytes32 rationaleHash,
        bytes32 txRef,
        uint256 timestamp,
        address recordedBy
    );

    function setUp() public {
        vm.prank(owner);
        ledger = new DecisionLedger(owner);
    }

    function test_onlyOwnerCanAuthorizeAgents() public {
        vm.expectRevert();
        ledger.setAgentAuthorization(agent, true);

        vm.prank(owner);
        ledger.setAgentAuthorization(agent, true);
        assertTrue(ledger.authorizedAgents(agent));
    }

    function test_unauthorizedAgentCannotRecordDecision() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(DecisionLedger.AgentNotAuthorized.selector, stranger));
        ledger.recordDecision(bytes32("TREASURY_AGENT"), DecisionLedger.ActionType.TREASURY_ALLOCATION, bytes32(0), bytes32(0));
    }

    function test_authorizedAgentCanRecordDecisionAndCountIncrements() public {
        vm.prank(owner);
        ledger.setAgentAuthorization(agent, true);

        bytes32 agentId = bytes32("TREASURY_AGENT");
        bytes32 rationaleHash = keccak256("allocated per policy bps");
        bytes32 txRef = bytes32(uint256(0x1234));

        vm.expectEmit(true, true, false, true);
        emit DecisionRecorded(0, agentId, DecisionLedger.ActionType.TREASURY_ALLOCATION, rationaleHash, txRef, block.timestamp, agent);

        vm.prank(agent);
        uint256 id = ledger.recordDecision(agentId, DecisionLedger.ActionType.TREASURY_ALLOCATION, rationaleHash, txRef);

        assertEq(id, 0);
        assertEq(ledger.decisionCount(), 1);

        vm.prank(agent);
        uint256 secondId = ledger.recordDecision(agentId, DecisionLedger.ActionType.ESCROW_OPEN, rationaleHash, txRef);
        assertEq(secondId, 1);
        assertEq(ledger.decisionCount(), 2);
    }

    function test_revokedAgentCannotRecordAfterDeauthorization() public {
        vm.startPrank(owner);
        ledger.setAgentAuthorization(agent, true);
        ledger.setAgentAuthorization(agent, false);
        vm.stopPrank();

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(DecisionLedger.AgentNotAuthorized.selector, agent));
        ledger.recordDecision(bytes32("TREASURY_AGENT"), DecisionLedger.ActionType.TREASURY_ALLOCATION, bytes32(0), bytes32(0));
    }
}
