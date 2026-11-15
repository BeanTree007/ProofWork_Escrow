// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ProofWorkEscrow} from "../src/ProofWorkEscrow.sol";
import {ProofWorkEscrowTestBase} from "./ProofWorkEscrowTestBase.sol";

contract ProofWorkEscrowAccountingTest is ProofWorkEscrowTestBase {
    /// @dev Exercises every allocation path while a fourth project's disputed
    ///      escrow remains locked, then withdraws all credits independently.
    function testAccountingInvariantAcrossAllProjectOutcomes() public {
        uint256 baseDeadline = block.timestamp + WORK_DURATION;
        uint256 approvedId = _createProjectFor(client, developer, DEFAULT_ESCROW, baseDeadline, DETAILS_HASH);
        uint256 refundId = _createProjectFor(client, developer, DEFAULT_ESCROW, block.timestamp + 1 days, DETAILS_HASH);
        uint256 timeoutId = _createProjectFor(client, developer, DEFAULT_ESCROW, baseDeadline, DETAILS_HASH);
        uint256 disputedId = _createProjectFor(client, developer, DEFAULT_ESCROW, baseDeadline, DETAILS_HASH);

        assertEq(escrow.totalEscrowed(), 4 * DEFAULT_ESCROW);
        _assertAccountingInvariant();

        _submitWebsite(approvedId);
        _assertAccountingInvariant();
        vm.prank(client);
        escrow.approveProject(approvedId);
        _assertAccountingInvariant();

        _submitWebsite(timeoutId);
        _assertAccountingInvariant();
        _submitWebsite(disputedId);
        vm.prank(client);
        escrow.disputeProject(disputedId);
        _assertAccountingInvariant();

        vm.warp(escrow.getProject(timeoutId).reviewDeadline);
        escrow.releaseAfterReview(timeoutId);
        _assertAccountingInvariant();

        // The refund deadline is earlier than the current time, so its public
        // refund path is eligible as well.
        escrow.refundAfterDeadline(refundId);
        _assertAccountingInvariant();

        assertEq(escrow.totalEscrowed(), DEFAULT_ESCROW);
        assertEq(escrow.totalClaimable(), 3 * DEFAULT_ESCROW);
        assertEq(escrow.claimable(developer), 2 * DEFAULT_ESCROW);
        assertEq(escrow.claimable(client), DEFAULT_ESCROW);
        assertEq(address(escrow).balance, 4 * DEFAULT_ESCROW);

        vm.prank(developer);
        escrow.withdrawTo(payoutRecipient);
        _assertAccountingInvariant();
        assertEq(escrow.claimable(developer), 0);
        assertEq(escrow.totalClaimable(), DEFAULT_ESCROW);
        assertEq(payoutRecipient.balance, 2 * DEFAULT_ESCROW);

        vm.prank(client);
        escrow.withdrawTo(client);
        _assertAccountingInvariant();
        assertEq(escrow.claimable(client), 0);
        assertEq(escrow.totalClaimable(), 0);

        // Only the disputed escrow remains in the contract, permanently locked.
        assertEq(address(escrow).balance, DEFAULT_ESCROW);
        assertEq(escrow.totalEscrowed(), DEFAULT_ESCROW);
        assertEq(uint256(escrow.getProject(disputedId).state), uint256(ProofWorkEscrow.ProjectState.Disputed));
    }
}
