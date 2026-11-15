// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ProofWorkEscrow} from "../src/ProofWorkEscrow.sol";
import {ProofWorkEscrowTestBase} from "./ProofWorkEscrowTestBase.sol";

contract ProofWorkEscrowBoundariesTest is ProofWorkEscrowTestBase {
    function testSubmissionOneSecondBeforeDeadlineSucceeds() public {
        uint256 projectId = _createProject();
        uint256 deadline = escrow.getProject(projectId).deadline;
        vm.warp(deadline - 1);

        _submitWebsite(projectId);

        assertEq(uint256(escrow.getProject(projectId).state), uint256(ProofWorkEscrow.ProjectState.Submitted));
    }

    function testSubmissionExactlyAtDeadlineFailsAndRefundIsAvailable() public {
        uint256 projectId = _createProject();
        uint256 deadline = escrow.getProject(projectId).deadline;
        vm.warp(deadline);

        _expectCustomError(ProofWorkEscrow.ActionWindowClosed.selector);
        vm.prank(developer);
        escrow.submitWebsite(projectId, "https://proofwork.example");

        vm.prank(stranger);
        escrow.refundAfterDeadline(projectId);
        assertEq(uint256(escrow.getProject(projectId).state), uint256(ProofWorkEscrow.ProjectState.Refunded));
    }

    function testSubmissionAfterDeadlineFails() public {
        uint256 projectId = _createProject();
        vm.warp(escrow.getProject(projectId).deadline + 1);

        _expectCustomError(ProofWorkEscrow.ActionWindowClosed.selector);
        vm.prank(developer);
        escrow.submitWebsite(projectId, "https://proofwork.example");
    }

    function testRefundOneSecondAfterDeadlineSucceeds() public {
        uint256 projectId = _createProject();
        vm.warp(escrow.getProject(projectId).deadline + 1);

        escrow.refundAfterDeadline(projectId);

        assertEq(escrow.claimable(client), DEFAULT_ESCROW);
        assertEq(uint256(escrow.getProject(projectId).state), uint256(ProofWorkEscrow.ProjectState.Refunded));
    }

    function testClientCanApproveOneSecondBeforeReviewDeadline() public {
        uint256 projectId = _createProject();
        _submitWebsite(projectId);
        uint256 reviewDeadline = escrow.getProject(projectId).reviewDeadline;
        vm.warp(reviewDeadline - 1);

        vm.prank(client);
        escrow.approveProject(projectId);

        assertEq(uint256(escrow.getProject(projectId).state), uint256(ProofWorkEscrow.ProjectState.Approved));
    }

    function testClientCanDisputeOneSecondBeforeReviewDeadline() public {
        uint256 projectId = _createProject();
        _submitWebsite(projectId);
        vm.warp(escrow.getProject(projectId).reviewDeadline - 1);

        vm.prank(client);
        escrow.disputeProject(projectId);

        assertEq(uint256(escrow.getProject(projectId).state), uint256(ProofWorkEscrow.ProjectState.Disputed));
    }

    function testAtReviewDeadlineClientActionsFailAndTimeoutReleaseSucceeds() public {
        uint256 projectId = _createProject();
        _submitWebsite(projectId);
        uint256 reviewDeadline = escrow.getProject(projectId).reviewDeadline;
        vm.warp(reviewDeadline);

        _expectCustomError(ProofWorkEscrow.ActionWindowClosed.selector);
        vm.prank(client);
        escrow.approveProject(projectId);

        _expectCustomError(ProofWorkEscrow.ActionWindowClosed.selector);
        vm.prank(client);
        escrow.disputeProject(projectId);

        vm.prank(stranger);
        escrow.releaseAfterReview(projectId);
        assertEq(uint256(escrow.getProject(projectId).state), uint256(ProofWorkEscrow.ProjectState.AutoReleased));
    }

    function testAfterReviewDeadlineClientActionsFailAndTimeoutReleaseSucceeds() public {
        uint256 projectId = _createProject();
        _submitWebsite(projectId);
        vm.warp(escrow.getProject(projectId).reviewDeadline + 1);

        _expectCustomError(ProofWorkEscrow.ActionWindowClosed.selector);
        vm.prank(client);
        escrow.approveProject(projectId);

        _expectCustomError(ProofWorkEscrow.ActionWindowClosed.selector);
        vm.prank(client);
        escrow.disputeProject(projectId);

        escrow.releaseAfterReview(projectId);
        assertEq(uint256(escrow.getProject(projectId).state), uint256(ProofWorkEscrow.ProjectState.AutoReleased));
    }

    function testPendingExtensionCannotBeApprovedAtOriginalDeadline() public {
        uint256 projectId = _createProject();
        uint256 deadline = escrow.getProject(projectId).deadline;
        vm.prank(developer);
        escrow.requestExtension(projectId, deadline + 2 days);
        vm.warp(deadline);

        _expectCustomError(ProofWorkEscrow.ActionWindowClosed.selector);
        vm.prank(client);
        escrow.respondToExtension(projectId, true);

        escrow.refundAfterDeadline(projectId);
        assertEq(escrow.claimable(client), DEFAULT_ESCROW);
    }

    function testApprovedExtensionMovesDeadlineRefundEligibility() public {
        uint256 projectId = _createProject();
        uint256 originalDeadline = escrow.getProject(projectId).deadline;
        uint256 extendedDeadline = originalDeadline + 2 days;

        vm.prank(developer);
        escrow.requestExtension(projectId, extendedDeadline);
        vm.prank(client);
        escrow.respondToExtension(projectId, true);

        vm.warp(originalDeadline);
        _expectCustomError(ProofWorkEscrow.DeadlineNotReached.selector);
        escrow.refundAfterDeadline(projectId);
        assertEq(escrow.getProject(projectId).deadline, extendedDeadline);

        vm.warp(extendedDeadline);
        escrow.refundAfterDeadline(projectId);
        assertEq(escrow.claimable(client), DEFAULT_ESCROW);
        assertEq(uint256(escrow.getProject(projectId).state), uint256(ProofWorkEscrow.ProjectState.Refunded));
    }

    function testExtensionRequestAtDeadlineIsRejected() public {
        uint256 projectId = _createProject();
        uint256 deadline = escrow.getProject(projectId).deadline;
        vm.warp(deadline);

        _expectCustomError(ProofWorkEscrow.ActionWindowClosed.selector);
        vm.prank(developer);
        escrow.requestExtension(projectId, deadline + 2 days);
    }
}
