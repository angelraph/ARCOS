// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import "../src/Escrow.sol";
import "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";

contract EscrowTest is Test {
    Escrow escrow;
    ERC20Mock usdc;

    address arbiter = address(0xA12B17E); // Governance/Procurement wallet acting as arbiter
    address payer = address(0xC0DE); // Procurement Agent wallet paying into escrow
    address supplier = address(0x5011); // Supplier Agent wallet, the payment recipient

    function setUp() public {
        usdc = new ERC20Mock();
        escrow = new Escrow(arbiter, address(usdc), "ARCOS Escrow", "1");

        usdc.mint(payer, 10_000e18);
        vm.prank(payer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function test_payOpensEscrowAndLocksFunds() public {
        vm.prank(payer);
        escrow.pay(supplier, 1_000e18, payer);

        assertEq(usdc.balanceOf(address(escrow)), 1_000e18);
        assertEq(escrow.balances(supplier), 1_000e18);

        (address to, uint256 amount,, address refundTo,, bool refunded) = escrow.payments(0);
        assertEq(to, supplier);
        assertEq(amount, 1_000e18);
        assertEq(refundTo, payer);
        assertFalse(refunded);
    }

    function test_supplierWithdrawsAfterDeliveryConfirmed() public {
        vm.prank(payer);
        escrow.pay(supplier, 1_000e18, payer);

        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;

        vm.prank(supplier);
        escrow.withdraw(ids);

        assertEq(usdc.balanceOf(supplier), 1_000e18);
        assertEq(escrow.balances(supplier), 0);
    }

    function test_strangerCannotWithdrawSomeoneElsesPayment() public {
        vm.prank(payer);
        escrow.pay(supplier, 1_000e18, payer);

        uint256[] memory ids = new uint256[](1);
        ids[0] = 0;

        vm.prank(payer); // payer is not the recipient
        vm.expectRevert(Escrow.CallerNotAllowed.selector);
        escrow.withdraw(ids);
    }

    function test_arbiterCanRefundIfDeliveryValidationFails() public {
        vm.prank(payer);
        escrow.pay(supplier, 1_000e18, payer);

        vm.prank(arbiter);
        escrow.refundByArbiter(0);

        assertEq(usdc.balanceOf(payer), 10_000e18); // fully refunded back to payer
        (,,,,, bool refunded) = escrow.payments(0);
        assertTrue(refunded);
    }

    function test_cannotRefundAlreadyRefundedPayment() public {
        vm.prank(payer);
        escrow.pay(supplier, 1_000e18, payer);

        vm.prank(arbiter);
        escrow.refundByArbiter(0);

        // Recipient balance is already drained by the first refund and the arbiter has no
        // balance of their own, so the second call reverts with InsufficientFunds before it
        // ever reaches the `refunded` check in _executeRefund. This is faithful behavior of
        // the original Circle contract, not an ARCOS modification.
        vm.prank(arbiter);
        vm.expectRevert(Escrow.InsufficientFunds.selector);
        escrow.refundByArbiter(0);
    }

    function test_onlyArbiterCanRefundByArbiter() public {
        vm.prank(payer);
        escrow.pay(supplier, 1_000e18, payer);

        vm.prank(payer);
        vm.expectRevert(Escrow.CallerNotAllowed.selector);
        escrow.refundByArbiter(0);
    }
}
