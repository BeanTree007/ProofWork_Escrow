// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ProofWorkEscrow} from "../src/ProofWorkEscrow.sol";
import {ProofWorkEscrowTestBase} from "./ProofWorkEscrowTestBase.sol";

contract ProofWorkEscrowHappyPathTest is ProofWorkEscrowTestBase {
    function testCreateProjectStoresRecordAndTracksEscrow() public {
        uint256 deadline = block.timestamp + WORK_DURATION;
        uint256 projectId = _createProjectFor(client, developer, DEFAULT_ESCROW, deadline, DETAILS_HASH);
        ProofWorkEscrow.Project memory project = escrow.getProject(projectId);

        assertEq(projectId, 1);
        assertEq(escrow.projectCount(), 1);
        assertEq(project.client, client);
        assertEq(project.developer, developer);
        assertEq(project.escrowAmount, DEFAULT_ESCROW);
        assertEq(uint256(project.state), uint256(ProofWorkEscrow.ProjectState.Funded));
        assertEq(project.createdAt, block.timestamp);
        assertEq(project.deadline, deadline);
        assertEq(project.detailsHash, DETAILS_HASH);
        assertEq(project.submittedAt, 0);
        assertEq(project.reviewDeadline, 0);
        assertEq(project.websiteURL, "");
        assertEq(project.requestedDeadline, 0);
        assertEq(escrow.totalEscrowed(), DEFAULT_ESCROW);
        assertEq(escrow.totalClaimable(), 0);
        _assertAccountingInvariant();
    }

    function testDeveloperRequestsAndClientApprovesExtension() public {
        uint256 projectId = _createProject();
        uint256 originalDeadline = escrow.getProject(projectId).deadline;
        uint256 requestedDeadline = originalDeadline + 5 days;

        vm.prank(developer);
        escrow.requestExtension(projectId, requestedDeadline);

        ProofWorkEscrow.Project memory project = escrow.getProject(projectId);
        assertEq(project.deadline, originalDeadline);
        assertEq(project.requestedDeadline, requestedDeadline);

        vm.prank(client);
        escrow.respondToExtension(projectId, true);

        project = escrow.getProject(projectId);
        assertEq(project.deadline, requestedDeadline);
        assertEq(project.requestedDeadline, 0);
        assertEq(uint256(project.state), uint256(ProofWorkEscrow.ProjectState.Funded));
        _assertAccountingInvariant();
    }

    function testClientRejectsExtensionAndOriginalDeadlineRemains() public {
        uint256 projectId = _createProject();
        uint256 originalDeadline = escrow.getProject(projectId).deadline;

        vm.prank(developer);
        escrow.requestExtension(projectId, originalDeadline + 5 days);

        vm.prank(client);
        escrow.respondToExtension(projectId, false);

        ProofWorkEscrow.Project memory project = escrow.getProject(projectId);
        assertEq(project.deadline, originalDeadline);
        assertEq(project.requestedDeadline, 0);
        _assertAccountingInvariant();
    }

    function testDeveloperSubmitsWebsiteAndReviewDeadlineIsSet() public {
        uint256 projectId = _createProject();
        uint256 submittedAt = block.timestamp;
        string memory websiteURL = "https://proofwork.example";

        vm.prank(developer);
        escrow.submitWebsite(projectId, websiteURL);

        ProofWorkEscrow.Project memory project = escrow.getProject(projectId);
        assertEq(uint256(project.state), uint256(ProofWorkEscrow.ProjectState.Submitted));
        assertEq(project.submittedAt, submittedAt);
        assertEq(project.reviewDeadline, submittedAt + REVIEW_PERIOD);
        assertEq(project.websiteURL, websiteURL);
        assertEq(project.requestedDeadline, 0);
        assertEq(escrow.totalEscrowed(), DEFAULT_ESCROW);
        assertEq(escrow.totalClaimable(), 0);
        _assertAccountingInvariant();
    }

    function testSubmissionClearsPendingExtensionRequest() public {
        uint256 projectId = _createProject();
        uint256 deadline = escrow.getProject(projectId).deadline;

        vm.prank(developer);
        escrow.requestExtension(projectId, deadline + 5 days);
        _submitWebsite(projectId);

        ProofWorkEscrow.Project memory project = escrow.getProject(projectId);
        assertEq(uint256(project.state), uint256(ProofWorkEscrow.ProjectState.Submitted));
        assertEq(project.requestedDeadline, 0);
        assertEq(project.deadline, deadline);
        _assertAccountingInvariant();
    }

    function testClientApprovalCreditsDeveloperWithoutTransferringMON() public {
        uint256 projectId = _createProject();
        _submitWebsite(projectId);

        vm.prank(client);
        escrow.approveProject(projectId);

        ProofWorkEscrow.Project memory project = escrow.getProject(projectId);
        assertEq(uint256(project.state), uint256(ProofWorkEscrow.ProjectState.Approved));
        assertEq(escrow.claimable(developer), DEFAULT_ESCROW);
        assertEq(escrow.claimable(client), 0);
        assertEq(escrow.totalEscrowed(), 0);
        assertEq(escrow.totalClaimable(), DEFAULT_ESCROW);
        assertEq(address(escrow).balance, DEFAULT_ESCROW);
        _assertAccountingInvariant();
    }

    function testDeveloperWithdrawsClaimableBalance() public {
        uint256 projectId = _createProject();
        _submitWebsite(projectId);
        vm.prank(client);
        escrow.approveProject(projectId);

        uint256 recipientBalanceBefore = payoutRecipient.balance;
        vm.prank(developer);
        escrow.withdrawTo(payoutRecipient);

        assertEq(payoutRecipient.balance, recipientBalanceBefore + DEFAULT_ESCROW);
        assertEq(escrow.claimable(developer), 0);
        assertEq(escrow.totalClaimable(), 0);
        assertEq(address(escrow).balance, 0);
        _assertAccountingInvariant();
    }

    function testAnyoneCanTriggerReviewTimeoutCredit() public {
        uint256 projectId = _createProject();
        _submitWebsite(projectId);
        uint256 reviewDeadline = escrow.getProject(projectId).reviewDeadline;
        vm.warp(reviewDeadline);

        vm.prank(stranger);
        escrow.releaseAfterReview(projectId);

        assertEq(uint256(escrow.getProject(projectId).state), uint256(ProofWorkEscrow.ProjectState.AutoReleased));
        assertEq(escrow.claimable(developer), DEFAULT_ESCROW);
        assertEq(escrow.totalEscrowed(), 0);
        assertEq(escrow.totalClaimable(), DEFAULT_ESCROW);
        _assertAccountingInvariant();
    }

    function testAnyoneCanTriggerMissedDeadlineRefundCredit() public {
        uint256 projectId = _createProject();
        uint256 deadline = escrow.getProject(projectId).deadline;
        vm.warp(deadline);

        vm.prank(stranger);
        escrow.refundAfterDeadline(projectId);

        assertEq(uint256(escrow.getProject(projectId).state), uint256(ProofWorkEscrow.ProjectState.Refunded));
        assertEq(escrow.claimable(client), DEFAULT_ESCROW);
        assertEq(escrow.claimable(developer), 0);
        assertEq(escrow.totalEscrowed(), 0);
        assertEq(escrow.totalClaimable(), DEFAULT_ESCROW);
        _assertAccountingInvariant();
    }

    function testDisputeLocksEscrowWithoutCreatingClaimableCredit() public {
        uint256 projectId = _createProject();
        _submitWebsite(projectId);

        vm.prank(client);
        escrow.disputeProject(projectId);

        assertEq(uint256(escrow.getProject(projectId).state), uint256(ProofWorkEscrow.ProjectState.Disputed));
        assertEq(escrow.totalEscrowed(), DEFAULT_ESCROW);
        assertEq(escrow.totalClaimable(), 0);
        assertEq(escrow.claimable(client), 0);
        assertEq(escrow.claimable(developer), 0);
        _assertAccountingInvariant();
    }
}
