// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ProofWorkEscrow} from "../src/ProofWorkEscrow.sol";
import {ProofWorkEscrowTestBase} from "./ProofWorkEscrowTestBase.sol";

contract ProofWorkEscrowFailuresTest is ProofWorkEscrowTestBase {
    function testZeroReviewPeriodIsRejected() public {
        _expectCustomError(ProofWorkEscrow.InvalidReviewPeriod.selector);
        new ProofWorkEscrow(0);
    }

    function testZeroEscrowIsRejected() public {
        _expectCustomError(ProofWorkEscrow.InvalidEscrowAmount.selector);
        vm.prank(client);
        escrow.createProject(developer, block.timestamp + WORK_DURATION, DETAILS_HASH);
    }

    function testZeroDeveloperIsRejected() public {
        _expectCustomError(ProofWorkEscrow.InvalidDeveloper.selector);
        vm.prank(client);
        escrow.createProject{value: DEFAULT_ESCROW}(address(0), block.timestamp + WORK_DURATION, DETAILS_HASH);
    }

    function testClientCannotAssignItselfAsDeveloper() public {
        _expectCustomError(ProofWorkEscrow.DeveloperCannotBeClient.selector);
        vm.prank(client);
        escrow.createProject{value: DEFAULT_ESCROW}(client, block.timestamp + WORK_DURATION, DETAILS_HASH);
    }

    function testDeadlineMustBeInFuture() public {
        _expectCustomError(ProofWorkEscrow.InvalidDeadline.selector);
        vm.prank(client);
        escrow.createProject{value: DEFAULT_ESCROW}(developer, block.timestamp, DETAILS_HASH);
    }

    function testPastDeadlineIsRejected() public {
        _expectCustomError(ProofWorkEscrow.InvalidDeadline.selector);
        vm.prank(client);
        escrow.createProject{value: DEFAULT_ESCROW}(developer, block.timestamp - 1, DETAILS_HASH);
    }

    function testDetailsHashMustNotBeEmpty() public {
        _expectCustomError(ProofWorkEscrow.InvalidDetailsHash.selector);
        vm.prank(client);
        escrow.createProject{value: DEFAULT_ESCROW}(developer, block.timestamp + WORK_DURATION, bytes32(0));
    }

    function testExtensionRequestCannotBeRepeatedWhilePending() public {
        uint256 projectId = _createProject();
        uint256 deadline = escrow.getProject(projectId).deadline;

        vm.prank(developer);
        escrow.requestExtension(projectId, deadline + 1 days);

        _expectCustomError(ProofWorkEscrow.ExtensionAlreadyPending.selector);
        vm.prank(developer);
        escrow.requestExtension(projectId, deadline + 2 days);
    }

    function testExtensionMustMoveDeadlineLater() public {
        uint256 projectId = _createProject();
        uint256 deadline = escrow.getProject(projectId).deadline;

        _expectCustomError(ProofWorkEscrow.InvalidRequestedDeadline.selector);
        vm.prank(developer);
        escrow.requestExtension(projectId, deadline);
    }

    function testExtensionCannotBeApprovedWithoutPendingRequest() public {
        uint256 projectId = _createProject();

        _expectCustomError(ProofWorkEscrow.NoPendingExtension.selector);
        vm.prank(client);
        escrow.respondToExtension(projectId, true);
    }

    function testEmptyWebsiteURLIsRejected() public {
        uint256 projectId = _createProject();

        _expectCustomError(ProofWorkEscrow.EmptyWebsiteURL.selector);
        vm.prank(developer);
        escrow.submitWebsite(projectId, "");
    }

    function testWebsiteURLOverByteLimitIsRejected() public {
        uint256 projectId = _createProject();
        string memory oversizedURL = string(new bytes(escrow.MAX_WEBSITE_URL_LENGTH() + 1));

        _expectCustomError(ProofWorkEscrow.WebsiteURLTooLong.selector);
        vm.prank(developer);
        escrow.submitWebsite(projectId, oversizedURL);
    }

    function testWebsiteURLAtByteLimitIsAccepted() public {
        uint256 projectId = _createProject();
        bytes memory urlBytes = new bytes(escrow.MAX_WEBSITE_URL_LENGTH());
        for (uint256 i; i < urlBytes.length; ++i) {
            urlBytes[i] = bytes1("a");
        }

        vm.prank(developer);
        escrow.submitWebsite(projectId, string(urlBytes));

        assertEq(bytes(escrow.getProject(projectId).websiteURL).length, 2048);
    }

    function testUnauthorizedDeveloperCannotRequestExtension() public {
        uint256 projectId = _createProject();
        uint256 deadline = escrow.getProject(projectId).deadline;

        _expectCustomError(ProofWorkEscrow.Unauthorized.selector);
        vm.prank(stranger);
        escrow.requestExtension(projectId, deadline + 1 days);
    }

    function testUnauthorizedClientCannotRespondToExtension() public {
        uint256 projectId = _createProject();
        uint256 deadline = escrow.getProject(projectId).deadline;
        vm.prank(developer);
        escrow.requestExtension(projectId, deadline + 1 days);

        _expectCustomError(ProofWorkEscrow.Unauthorized.selector);
        vm.prank(stranger);
        escrow.respondToExtension(projectId, true);
    }

    function testUnauthorizedDeveloperCannotSubmitWebsite() public {
        uint256 projectId = _createProject();

        _expectCustomError(ProofWorkEscrow.Unauthorized.selector);
        vm.prank(stranger);
        escrow.submitWebsite(projectId, "https://proofwork.example");
    }

    function testUnauthorizedAccountCannotApproveProject() public {
        uint256 projectId = _createProject();
        _submitWebsite(projectId);

        _expectCustomError(ProofWorkEscrow.Unauthorized.selector);
        vm.prank(stranger);
        escrow.approveProject(projectId);
    }

    function testUnauthorizedAccountCannotDisputeProject() public {
        uint256 projectId = _createProject();
        _submitWebsite(projectId);

        _expectCustomError(ProofWorkEscrow.Unauthorized.selector);
        vm.prank(stranger);
        escrow.disputeProject(projectId);
    }

    function testCallerCannotWithdrawAnotherAccountsCredit() public {
        uint256 projectId = _createProject();
        _submitWebsite(projectId);
        vm.prank(client);
        escrow.approveProject(projectId);

        _expectCustomError(ProofWorkEscrow.NoClaimableBalance.selector);
        vm.prank(client);
        escrow.withdrawTo(payoutRecipient);

        assertEq(escrow.claimable(developer), DEFAULT_ESCROW);
        assertEq(escrow.totalClaimable(), DEFAULT_ESCROW);
        _assertAccountingInvariant();
    }

    function testZeroWithdrawalRecipientIsRejected() public {
        uint256 projectId = _createProject();
        _submitWebsite(projectId);
        vm.prank(client);
        escrow.approveProject(projectId);

        _expectCustomError(ProofWorkEscrow.ZeroAddressRecipient.selector);
        vm.prank(developer);
        escrow.withdrawTo(address(0));
    }

    function testWithdrawalWithZeroBalanceIsRejected() public {
        _expectCustomError(ProofWorkEscrow.NoClaimableBalance.selector);
        vm.prank(developer);
        escrow.withdrawTo(payoutRecipient);
    }

    function testDuplicateWithdrawalIsRejected() public {
        uint256 projectId = _createProject();
        _submitWebsite(projectId);
        vm.prank(client);
        escrow.approveProject(projectId);

        vm.prank(developer);
        escrow.withdrawTo(payoutRecipient);

        _expectCustomError(ProofWorkEscrow.NoClaimableBalance.selector);
        vm.prank(developer);
        escrow.withdrawTo(payoutRecipient);
    }

    function testWithdrawalFailurePreservesCredit() public {
        uint256 projectId = _createProject();
        _submitWebsite(projectId);
        vm.prank(client);
        escrow.approveProject(projectId);
        RejectingReceiver receiver = new RejectingReceiver();

        _expectCustomError(ProofWorkEscrow.WithdrawalFailed.selector);
        vm.prank(developer);
        escrow.withdrawTo(address(receiver));

        assertEq(escrow.claimable(developer), DEFAULT_ESCROW);
        assertEq(escrow.totalClaimable(), DEFAULT_ESCROW);
        _assertAccountingInvariant();
    }

    function testWebsiteCannotBeSubmittedTwice() public {
        uint256 projectId = _createProject();
        _submitWebsite(projectId);

        _expectCustomError(ProofWorkEscrow.InvalidState.selector);
        vm.prank(developer);
        escrow.submitWebsite(projectId, "https://another.example");
    }

    function testApprovalCannotBeRepeated() public {
        uint256 projectId = _createProject();
        _submitWebsite(projectId);
        vm.prank(client);
        escrow.approveProject(projectId);
        uint256 claimableBefore = escrow.claimable(developer);

        _expectCustomError(ProofWorkEscrow.InvalidState.selector);
        vm.prank(client);
        escrow.approveProject(projectId);

        assertEq(escrow.claimable(developer), claimableBefore);
        assertEq(escrow.totalEscrowed(), 0);
        assertEq(escrow.totalClaimable(), DEFAULT_ESCROW);
    }

    function testDisputeAfterApprovalIsRejected() public {
        uint256 projectId = _createProject();
        _submitWebsite(projectId);
        vm.prank(client);
        escrow.approveProject(projectId);

        _expectCustomError(ProofWorkEscrow.InvalidState.selector);
        vm.prank(client);
        escrow.disputeProject(projectId);
    }

    function testRefundAfterSubmissionIsRejected() public {
        uint256 projectId = _createProject();
        _submitWebsite(projectId);
        vm.warp(escrow.getProject(projectId).deadline);

        _expectCustomError(ProofWorkEscrow.InvalidState.selector);
        escrow.refundAfterDeadline(projectId);
    }

    function testRefundBeforeDeadlineIsRejected() public {
        uint256 projectId = _createProject();

        _expectCustomError(ProofWorkEscrow.DeadlineNotReached.selector);
        escrow.refundAfterDeadline(projectId);

        assertEq(uint256(escrow.getProject(projectId).state), uint256(ProofWorkEscrow.ProjectState.Funded));
        assertEq(escrow.totalEscrowed(), DEFAULT_ESCROW);
        assertEq(escrow.totalClaimable(), 0);
        _assertAccountingInvariant();
    }

    function testReviewTimeoutReleaseBeforeReviewDeadlineIsRejected() public {
        uint256 projectId = _createProject();
        _submitWebsite(projectId);

        _expectCustomError(ProofWorkEscrow.DeadlineNotReached.selector);
        escrow.releaseAfterReview(projectId);

        assertEq(uint256(escrow.getProject(projectId).state), uint256(ProofWorkEscrow.ProjectState.Submitted));
        assertEq(escrow.totalEscrowed(), DEFAULT_ESCROW);
        assertEq(escrow.totalClaimable(), 0);
        _assertAccountingInvariant();
    }

    function testTimeoutReleaseAfterApprovalIsRejected() public {
        uint256 projectId = _createProject();
        _submitWebsite(projectId);
        vm.prank(client);
        escrow.approveProject(projectId);
        vm.warp(escrow.getProject(projectId).reviewDeadline);

        _expectCustomError(ProofWorkEscrow.InvalidState.selector);
        escrow.releaseAfterReview(projectId);
    }

    function testRefundedProjectCannotBeApproved() public {
        uint256 projectId = _createProject();
        vm.warp(escrow.getProject(projectId).deadline);
        escrow.refundAfterDeadline(projectId);

        _expectCustomError(ProofWorkEscrow.InvalidState.selector);
        vm.prank(client);
        escrow.approveProject(projectId);
    }

    function testApprovedProjectCannotBeRefunded() public {
        uint256 projectId = _createProject();
        _submitWebsite(projectId);
        vm.prank(client);
        escrow.approveProject(projectId);
        vm.warp(escrow.getProject(projectId).deadline);

        _expectCustomError(ProofWorkEscrow.InvalidState.selector);
        escrow.refundAfterDeadline(projectId);
    }

    function testDisputedProjectCannotTimeoutOrWithdraw() public {
        uint256 projectId = _createProject();
        _submitWebsite(projectId);
        vm.prank(client);
        escrow.disputeProject(projectId);
        vm.warp(escrow.getProject(projectId).reviewDeadline);

        _expectCustomError(ProofWorkEscrow.InvalidState.selector);
        escrow.releaseAfterReview(projectId);

        _expectCustomError(ProofWorkEscrow.NoClaimableBalance.selector);
        vm.prank(developer);
        escrow.withdrawTo(payoutRecipient);

        assertEq(escrow.totalEscrowed(), DEFAULT_ESCROW);
        assertEq(escrow.totalClaimable(), 0);
        _assertAccountingInvariant();
    }

    function testActionsOnNonexistentProjectAreRejected() public {
        uint256 nonexistentId = 999;

        _expectCustomError(ProofWorkEscrow.ProjectNotFound.selector);
        escrow.getProject(nonexistentId);

        _expectCustomError(ProofWorkEscrow.ProjectNotFound.selector);
        escrow.requestExtension(nonexistentId, block.timestamp + 1 days);

        _expectCustomError(ProofWorkEscrow.ProjectNotFound.selector);
        escrow.refundAfterDeadline(nonexistentId);
    }
}

contract RejectingReceiver {
    receive() external payable {
        revert("reject native MON");
    }
}
