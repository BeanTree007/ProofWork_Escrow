// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Planning interface only. This is not a deployable escrow contract.
interface IProofWorkEscrow {
    enum ProjectState {
        Created,
        Funded,
        InProgress,
        Submitted,
        Approved,
        Disputed,
        Expired,
        Refunded
    }

    // TODO: Agree on metadata, state transitions, events and review duration.
    // Creation and funding must be atomic in the implementation.
    function createProject(address developer, uint256 deadline, string calldata metadataURI)
        external
        payable
        returns (uint256 projectId);

    function acceptProject(uint256 projectId) external;
    function submitWebsite(uint256 projectId, string calldata websiteURL) external;
    function requestExtension(uint256 projectId, uint256 requestedDeadline) external;
    function respondToExtension(uint256 projectId, bool approve) external;
    function approveProject(uint256 projectId) external;
    function disputeProject(uint256 projectId) external;
    function claimDeadlineRefund(uint256 projectId) external;

    // TODO: Allow an eligible caller to settle after an undisputed review expires.
    function settleExpiredReview(uint256 projectId) external;
}
