// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import "../src/TreasuryPolicy.sol";
import "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";

contract TreasuryPolicyTest is Test {
    TreasuryPolicy policy;
    ERC20Mock usdc;

    address owner = address(0xA11CE);
    address governance = address(0x60BE);
    address agent = address(0xBEEF);
    address customer = address(0xC0DE);
    address supplier = address(0x5011);

    uint256 constant SPEND_THRESHOLD = 1_000e18;

    function setUp() public {
        usdc = new ERC20Mock();

        string[4] memory names = ["Tax", "Payroll", "Operating", "Procurement"];
        uint16[4] memory bps = [uint16(1000), uint16(4000), uint16(3000), uint16(2000)]; // sums to 10000

        vm.prank(owner);
        policy = new TreasuryPolicy(owner, address(usdc), governance, names, bps, SPEND_THRESHOLD);

        vm.prank(owner);
        policy.setAgentAuthorization(agent, true);

        usdc.mint(customer, 100_000e18);
        vm.prank(customer);
        usdc.approve(address(policy), type(uint256).max);
    }

    function test_bpsMustSumTo10000AtDeploy() public {
        string[4] memory names = ["Tax", "Payroll", "Operating", "Procurement"];
        uint16[4] memory badBps = [uint16(1000), uint16(4000), uint16(3000), uint16(1999)]; // sums to 9999

        vm.expectRevert(TreasuryPolicy.BpsMustSumTo10000.selector);
        new TreasuryPolicy(owner, address(usdc), governance, names, badBps, SPEND_THRESHOLD);
    }

    function test_receivePaymentAllocatesAcrossBucketsByBps() public {
        vm.prank(customer);
        policy.receivePayment(10_000e18);

        assertEq(policy.bucketBalance(0), 1_000e18); // Tax 10%
        assertEq(policy.bucketBalance(1), 4_000e18); // Payroll 40%
        assertEq(policy.bucketBalance(2), 3_000e18); // Operating 30%
        assertEq(policy.bucketBalance(3), 2_000e18); // Procurement 20%
        assertEq(usdc.balanceOf(address(policy)), 10_000e18);
    }

    function test_lastBucketAbsorbsRoundingRemainder() public {
        // 1 wei of USDC: bps math for buckets 0-2 all round down to 0, bucket 3 (last) must absorb the full 1 wei
        vm.prank(customer);
        policy.receivePayment(1);

        assertEq(policy.bucketBalance(0), 0);
        assertEq(policy.bucketBalance(1), 0);
        assertEq(policy.bucketBalance(2), 0);
        assertEq(policy.bucketBalance(3), 1);
    }

    function test_spendUnderThresholdAutoExecutes() public {
        vm.prank(customer);
        policy.receivePayment(10_000e18);

        vm.prank(agent);
        uint256 spendId = policy.proposeSpend(2, 500e18, supplier, keccak256("restock tomatoes"));

        (,,,, bool approved, bool executed) = policy.pendingSpends(spendId);
        assertFalse(approved);
        assertTrue(executed);
        assertEq(usdc.balanceOf(supplier), 500e18);
        assertEq(policy.bucketBalance(2), 3_000e18 - 500e18);
    }

    function test_spendOverThresholdWaitsForGovernance() public {
        vm.prank(customer);
        policy.receivePayment(10_000e18);

        vm.prank(agent);
        uint256 spendId = policy.proposeSpend(2, 2_000e18, supplier, keccak256("bulk supplier order"));

        (,,,, bool approved, bool executed) = policy.pendingSpends(spendId);
        assertFalse(approved);
        assertFalse(executed);
        assertEq(usdc.balanceOf(supplier), 0);

        vm.prank(customer); // not governance
        vm.expectRevert(TreasuryPolicy.CallerNotGovernance.selector);
        policy.approveSpend(spendId);

        vm.prank(governance);
        policy.approveSpend(spendId);

        (,,,, bool approvedAfter, bool executedAfter) = policy.pendingSpends(spendId);
        assertTrue(approvedAfter);
        assertTrue(executedAfter);
        assertEq(usdc.balanceOf(supplier), 2_000e18);
    }

    function test_cannotDoubleExecuteApprovedSpend() public {
        vm.prank(customer);
        policy.receivePayment(10_000e18);

        vm.prank(agent);
        uint256 spendId = policy.proposeSpend(2, 2_000e18, supplier, keccak256("bulk supplier order"));

        vm.prank(governance);
        policy.approveSpend(spendId);

        vm.prank(governance);
        vm.expectRevert(abi.encodeWithSelector(TreasuryPolicy.SpendAlreadyExecuted.selector, spendId));
        policy.approveSpend(spendId);
    }

    function test_proposeSpendRevertsIfBucketUnderfunded() public {
        vm.prank(customer);
        policy.receivePayment(1_000e18); // Operating bucket gets 300e18

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(TreasuryPolicy.InsufficientBucketBalance.selector, 2, 500e18, 300e18));
        policy.proposeSpend(2, 500e18, supplier, keccak256("too much"));
    }

    function test_unauthorizedAgentCannotProposeSpend() public {
        vm.prank(customer);
        policy.receivePayment(10_000e18);

        vm.prank(customer);
        vm.expectRevert(abi.encodeWithSelector(TreasuryPolicy.AgentNotAuthorized.selector, customer));
        policy.proposeSpend(2, 100e18, supplier, keccak256("not an agent"));
    }
}
