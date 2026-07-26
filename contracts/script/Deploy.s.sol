// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import "../src/DecisionLedger.sol";
import "../src/TreasuryPolicy.sol";
import "../src/Escrow.sol";

/// @notice Deploys DecisionLedger, TreasuryPolicy, and Escrow to Arc Testnet.
///
/// Usage:
///   forge script script/Deploy.s.sol:Deploy --rpc-url arc_testnet --broadcast --verify -vvvv
///
/// Required env vars (see .env.example):
///   DEPLOYER_PRIVATE_KEY   - funds gas for deployment (native USDC on Arc, 18 decimals)
///   GOVERNANCE_ADDRESS     - wallet address gating above-threshold spends
///   SPEND_THRESHOLD_USDC   - integer USDC threshold (6 decimals) above which governance
///                            approval is required; defaults to 1000 USDC if unset
///
/// Arc Testnet's commerce USDC is the ERC-20 token at a fixed address (6 decimals) —
/// NOT the native 18-decimal gas token used only to pay tx fees.
contract Deploy is Script {
    address constant ARC_TESTNET_USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address governance = vm.envOr("GOVERNANCE_ADDRESS", deployer);
        uint256 spendThresholdUsdc = vm.envOr("SPEND_THRESHOLD_USDC", uint256(1_000));
        uint256 spendThreshold = spendThresholdUsdc * 1e6; // USDC has 6 decimals

        string[4] memory bucketNames = ["Tax", "Payroll", "Operating", "Procurement"];
        uint16[4] memory bucketBps = [uint16(1000), uint16(4000), uint16(3000), uint16(2000)];

        vm.startBroadcast(deployerKey);

        DecisionLedger ledger = new DecisionLedger(deployer);
        TreasuryPolicy treasury = new TreasuryPolicy(
            deployer, ARC_TESTNET_USDC, governance, bucketNames, bucketBps, spendThreshold
        );
        Escrow escrow = new Escrow(governance, ARC_TESTNET_USDC, "ARCOS Escrow", "1");

        vm.stopBroadcast();

        console.log("DecisionLedger deployed at:", address(ledger));
        console.log("TreasuryPolicy deployed at:", address(treasury));
        console.log("Escrow deployed at:        ", address(escrow));
        console.log("");
        console.log("Copy these into .env as DECISION_LEDGER_ADDRESS / TREASURY_POLICY_ADDRESS / ESCROW_ADDRESS");
    }
}
