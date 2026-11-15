// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ProofWorkEscrow} from "../src/ProofWorkEscrow.sol";

/// @dev Shared actors, deployment, and helpers for focused workflow test files.
abstract contract ProofWorkEscrowTestBase is Test {
    uint256 internal constant REVIEW_PERIOD = 7 days;
    uint256 internal constant WORK_DURATION = 30 days;
    uint256 internal constant DEFAULT_ESCROW = 1 ether;
    uint256 internal constant INITIAL_TIMESTAMP = 1_000_000;
    bytes32 internal constant DETAILS_HASH = keccak256("project requirements");

    address internal client;
    address internal developer;
    address internal stranger;
    address internal payoutRecipient;
    ProofWorkEscrow internal escrow;

    function setUp() public virtual {
        vm.warp(INITIAL_TIMESTAMP);

        client = makeAddr("client");
        developer = makeAddr("developer");
        stranger = makeAddr("stranger");
        payoutRecipient = makeAddr("payout recipient");

        vm.deal(client, 1_000 ether);
        vm.deal(developer, 1_000 ether);
        vm.deal(stranger, 1_000 ether);

        escrow = new ProofWorkEscrow(REVIEW_PERIOD);
    }

    function _createProject() internal returns (uint256) {
        return _createProjectFor(client, developer, DEFAULT_ESCROW, block.timestamp + WORK_DURATION, DETAILS_HASH);
    }

    function _createProjectFor(
        address projectClient,
        address projectDeveloper,
        uint256 amount,
        uint256 deadline,
        bytes32 detailsHash
    ) internal returns (uint256 projectId) {
        vm.prank(projectClient);
        projectId = escrow.createProject{value: amount}(projectDeveloper, deadline, detailsHash);
    }

    function _submitWebsite(uint256 projectId) internal {
        vm.prank(developer);
        escrow.submitWebsite(projectId, "https://proofwork.example");
    }

    /// @dev Match a custom-error selector while allowing its encoded arguments.
    function _expectCustomError(bytes4 selector) internal {
        vm.expectPartialRevert(selector);
    }

    /// @dev The test workflows do not force-send unsolicited MON, so they
    ///      assert both the required solvency inequality and exact accounting.
    function _assertAccountingInvariant() internal view {
        uint256 liabilities = escrow.totalEscrowed() + escrow.totalClaimable();
        assertGe(address(escrow).balance, liabilities, "escrow is undercollateralized");
        assertEq(address(escrow).balance, liabilities, "unexpected unaccounted MON");
    }
}
