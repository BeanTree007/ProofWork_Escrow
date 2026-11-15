// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ProofWorkEscrow
/// @notice Native-MON escrow for a single website-development project workflow.
/// @dev This MVP has no owner, arbitration, dispute settlement, or emergency
///      recovery. Disputed project funds remain locked indefinitely.
contract ProofWorkEscrow {
    /// @notice Project lifecycle states. Extension requests are project data,
    ///         not a separate state.
    enum ProjectState {
        None, // Default mapping value; no project exists for this ID.
        Funded, // Escrow is locked; the assigned developer may work immediately.
        Submitted, // Developer submitted a URL; client review is pending.
        Approved, // Client approved; developer has a claimable credit.
        AutoReleased, // Review expired; developer has a claimable credit.
        Disputed, // Client disputed; escrow is locked with no MVP exit.
        Refunded // Deadline passed; client has a claimable credit.
    }

    /// @notice On-chain data needed to enforce and display a project.
    /// @dev Requirements and inspection reports remain off-chain. `detailsHash`
    ///      binds the project to the canonical off-chain requirements.
    struct Project {
        address client;
        address developer;
        uint256 escrowAmount;
        ProjectState state;
        uint256 createdAt;
        uint256 deadline;
        bytes32 detailsHash;
        uint256 submittedAt;
        uint256 reviewDeadline;
        string websiteURL;
        uint256 requestedDeadline;
    }

    error InvalidReviewPeriod();
    error ProjectNotFound(uint256 projectId);
    error InvalidDeveloper(address developer);
    error DeveloperCannotBeClient();
    error InvalidEscrowAmount();
    error InvalidDeadline(uint256 deadline);
    error InvalidDetailsHash();
    error Unauthorized(address caller);
    error InvalidState(
        uint256 projectId,
        ProjectState expected,
        ProjectState actual
    );
    error ActionWindowClosed(uint256 cutoff);
    error DeadlineNotReached(uint256 deadline);
    error ExtensionAlreadyPending();
    error NoPendingExtension();
    error InvalidRequestedDeadline(uint256 requestedDeadline, uint256 currentDeadline);
    error EmptyWebsiteURL();
    error WebsiteURLTooLong(uint256 suppliedLength, uint256 maximumLength);
    error ZeroAddressRecipient();
    error NoClaimableBalance(address account);
    error ReentrantCall();
    error WithdrawalFailed(address recipient, uint256 amount);

    /// @notice Emitted when a project is created and funded atomically.
    event ProjectCreated(
        uint256 indexed projectId,
        address indexed client,
        address indexed developer,
        uint256 amount,
        uint256 deadline,
        bytes32 detailsHash
    );

    /// @notice Emitted when the assigned developer requests a deadline change.
    event ExtensionRequested(
        uint256 indexed projectId,
        address indexed developer,
        uint256 currentDeadline,
        uint256 requestedDeadline
    );

    /// @notice Emitted when the client responds to a pending extension request.
    event ExtensionResponded(
        uint256 indexed projectId,
        address indexed client,
        bool approved,
        uint256 resultingDeadline
    );

    /// @notice Emitted when the assigned developer submits the website URL.
    event WebsiteSubmitted(
        uint256 indexed projectId,
        address indexed developer,
        string websiteURL,
        uint256 submittedAt,
        uint256 reviewDeadline
    );

    /// @notice Emitted when the client approves and the developer is credited.
    event ProjectApproved(
        uint256 indexed projectId,
        address indexed client,
        address indexed developer,
        uint256 amount
    );

    /// @notice Emitted when the client disputes; the escrow remains locked.
    event ProjectDisputed(
        uint256 indexed projectId,
        address indexed client,
        uint256 amountLocked
    );

    /// @notice Emitted when a missed-deadline refund is credited to the client.
    event DeadlineRefunded(
        uint256 indexed projectId,
        address indexed client,
        uint256 amount,
        uint256 deadline
    );

    /// @notice Emitted when review timeout credits the developer.
    event ReviewTimedOut(
        uint256 indexed projectId,
        address indexed developer,
        uint256 amount,
        uint256 reviewDeadline
    );

    /// @notice Emitted after a successful pull-payment withdrawal.
    event Withdrawal(
        address indexed account,
        address indexed recipient,
        uint256 amount
    );

    /// @notice Review time allowed after website submission.
    /// @dev Fixed at deployment and never changed after funds are accepted.
    uint256 public immutable reviewPeriod;

    /// @notice Maximum website URL size, measured in UTF-8 bytes.
    uint256 public constant MAX_WEBSITE_URL_LENGTH = 2048;

    /// @notice Total native MON allocated to projects not yet terminally paid
    ///         or refunded. Disputed funds remain included indefinitely.
    uint256 public totalEscrowed;

    /// @notice Sum of all user credits that have not yet been withdrawn.
    uint256 public totalClaimable;

    /// @notice Native MON a beneficiary may withdraw to a chosen recipient.
    mapping(address account => uint256 amount) public claimable;

    mapping(uint256 projectId => Project project) private _projects;

    /// @dev IDs start at 1 so the default `None` state always means absent.
    uint256 private _projectCount;

    /// @dev Reentrancy guard used by the only function that makes an external
    ///      call. Other project actions make no external calls.
    bool private _withdrawEntered;

    /// @param reviewPeriod_ Nonzero review window, in seconds.
    constructor(uint256 reviewPeriod_) {
        if (reviewPeriod_ == 0) revert InvalidReviewPeriod();
        reviewPeriod = reviewPeriod_;
    }

    /// @dev Rejects unknown IDs before a state or permission check.
    modifier projectExists(uint256 projectId) {
        if (_projects[projectId].state == ProjectState.None) {
            revert ProjectNotFound(projectId);
        }
        _;
    }

    /// @dev Restricts a project action to its funding client.
    modifier onlyClient(uint256 projectId) {
        if (_projects[projectId].client != msg.sender) {
            revert Unauthorized(msg.sender);
        }
        _;
    }

    /// @dev Restricts a project action to its assigned developer.
    modifier onlyDeveloper(uint256 projectId) {
        if (_projects[projectId].developer != msg.sender) {
            revert Unauthorized(msg.sender);
        }
        _;
    }

    /// @dev Enforces an exact lifecycle state before an action.
    modifier inState(uint256 projectId, ProjectState expected) {
        ProjectState actual = _projects[projectId].state;
        if (actual != expected) {
            revert InvalidState(projectId, expected, actual);
        }
        _;
    }

    /// @dev Prevents nested withdrawals while a recipient callback is running.
    modifier nonReentrant() {
        if (_withdrawEntered) revert ReentrantCall();
        _withdrawEntered = true;
        _;
        _withdrawEntered = false;
    }

    /// @notice Creates and funds a project in one transaction.
    /// @dev Creation is the client's binding instruction to fund the assigned
    ///      developer. Work may begin immediately; there is no acceptance
    ///      action or cancellation path in this MVP. The deadline starts now.
    /// @param developer Fixed developer permitted to submit and request extensions.
    /// @param deadline Exclusive cutoff for website submission.
    /// @param detailsHash Hash of the canonical off-chain project requirements.
    /// @return projectId Newly created project ID, starting at 1.
    function createProject(
        address developer,
        uint256 deadline,
        bytes32 detailsHash
    ) external payable returns (uint256 projectId) {
        if (msg.value == 0) revert InvalidEscrowAmount();
        if (developer == address(0)) revert InvalidDeveloper(developer);
        if (developer == msg.sender) revert DeveloperCannotBeClient();
        if (deadline <= block.timestamp) revert InvalidDeadline(deadline);
        if (detailsHash == bytes32(0)) revert InvalidDetailsHash();

        projectId = ++_projectCount;
        _projects[projectId] = Project({
            client: msg.sender,
            developer: developer,
            escrowAmount: msg.value,
            state: ProjectState.Funded,
            createdAt: block.timestamp,
            deadline: deadline,
            detailsHash: detailsHash,
            submittedAt: 0,
            reviewDeadline: 0,
            websiteURL: "",
            requestedDeadline: 0
        });

        // The entire deposit becomes a project liability. No external call is
        // made, and a revert rolls back both the project and this accounting.
        totalEscrowed += msg.value;

        emit ProjectCreated(
            projectId,
            msg.sender,
            developer,
            msg.value,
            deadline,
            detailsHash
        );
    }

    /// @notice Requests a later submission deadline.
    /// @dev The assigned developer may make one request at a time. Requesting
    ///      does not pause or change the current deadline.
    /// @param projectId Existing funded project.
    /// @param requestedDeadline Proposed replacement deadline.
    function requestExtension(
        uint256 projectId,
        uint256 requestedDeadline
    )
        external
        projectExists(projectId)
        onlyDeveloper(projectId)
        inState(projectId, ProjectState.Funded)
    {
        Project storage project = _projects[projectId];
        if (block.timestamp >= project.deadline) {
            revert ActionWindowClosed(project.deadline);
        }
        if (project.requestedDeadline != 0) revert ExtensionAlreadyPending();
        if (requestedDeadline <= project.deadline) {
            revert InvalidRequestedDeadline(requestedDeadline, project.deadline);
        }

        project.requestedDeadline = requestedDeadline;

        emit ExtensionRequested(
            projectId,
            msg.sender,
            project.deadline,
            requestedDeadline
        );
    }

    /// @notice Approves or denies the pending extension request.
    /// @dev The client must respond before the existing deadline. A denial or
    ///      lack of response leaves that deadline unchanged.
    /// @param projectId Existing funded project.
    /// @param approve Whether to replace the deadline with the requested date.
    function respondToExtension(
        uint256 projectId,
        bool approve
    )
        external
        projectExists(projectId)
        onlyClient(projectId)
        inState(projectId, ProjectState.Funded)
    {
        Project storage project = _projects[projectId];
        if (project.requestedDeadline == 0) revert NoPendingExtension();
        if (block.timestamp >= project.deadline) {
            revert ActionWindowClosed(project.deadline);
        }

        uint256 resultingDeadline = project.deadline;
        if (approve) {
            resultingDeadline = project.requestedDeadline;
            project.deadline = resultingDeadline;
        }
        project.requestedDeadline = 0;

        emit ExtensionResponded(
            projectId,
            msg.sender,
            approve,
            resultingDeadline
        );
    }

    /// @notice Submits the developer's website and starts client review.
    /// @dev The contract stores a bounded URL for display but never fetches it.
    ///      Submission must occur strictly before the current (possibly
    ///      extended) deadline. A pending extension is discarded.
    /// @param projectId Existing funded project.
    /// @param websiteURL Submitted website URL.
    function submitWebsite(
        uint256 projectId,
        string calldata websiteURL
    )
        external
        projectExists(projectId)
        onlyDeveloper(projectId)
        inState(projectId, ProjectState.Funded)
    {
        Project storage project = _projects[projectId];
        if (block.timestamp >= project.deadline) {
            revert ActionWindowClosed(project.deadline);
        }

        uint256 urlLength = bytes(websiteURL).length;
        if (urlLength == 0) revert EmptyWebsiteURL();
        if (urlLength > MAX_WEBSITE_URL_LENGTH) {
            revert WebsiteURLTooLong(urlLength, MAX_WEBSITE_URL_LENGTH);
        }

        uint256 submittedAt = block.timestamp;
        // Solidity 0.8 checked arithmetic rejects an unrepresentable cutoff.
        uint256 reviewDeadline = submittedAt + reviewPeriod;

        project.state = ProjectState.Submitted;
        project.submittedAt = submittedAt;
        project.reviewDeadline = reviewDeadline;
        project.websiteURL = websiteURL;
        project.requestedDeadline = 0;

        emit WebsiteSubmitted(
            projectId,
            msg.sender,
            websiteURL,
            submittedAt,
            reviewDeadline
        );
    }

    /// @notice Approves submitted work and credits the developer.
    /// @dev No native MON is transferred during approval. The developer later
    ///      withdraws its pull-payment credit.
    /// @param projectId Existing submitted project.
    function approveProject(
        uint256 projectId
    )
        external
        projectExists(projectId)
        onlyClient(projectId)
        inState(projectId, ProjectState.Submitted)
    {
        Project storage project = _projects[projectId];
        if (block.timestamp >= project.reviewDeadline) {
            revert ActionWindowClosed(project.reviewDeadline);
        }

        uint256 amount = project.escrowAmount;
        address developer = project.developer;
        _allocateEscrow(project, developer, ProjectState.Approved);

        emit ProjectApproved(projectId, msg.sender, developer, amount);
    }

    /// @notice Disputes submitted work and locks the escrow.
    /// @dev Disputed is terminal in this MVP. No party, owner, backend, or AI
    ///      can settle or withdraw these funds.
    /// @param projectId Existing submitted project.
    function disputeProject(
        uint256 projectId
    )
        external
        projectExists(projectId)
        onlyClient(projectId)
        inState(projectId, ProjectState.Submitted)
    {
        Project storage project = _projects[projectId];
        if (block.timestamp >= project.reviewDeadline) {
            revert ActionWindowClosed(project.reviewDeadline);
        }

        project.state = ProjectState.Disputed;
        emit ProjectDisputed(projectId, msg.sender, project.escrowAmount);
    }

    /// @notice Credits the client after the pre-submission deadline is missed.
    /// @dev Permissionless to call, but the beneficiary is always the client.
    ///      A pending extension does not pause the deadline; only prior client
    ///      approval changes the deadline. No MON is transferred in this call.
    /// @param projectId Existing funded project.
    function refundAfterDeadline(
        uint256 projectId
    )
        external
        projectExists(projectId)
        inState(projectId, ProjectState.Funded)
    {
        Project storage project = _projects[projectId];
        if (block.timestamp < project.deadline) {
            revert DeadlineNotReached(project.deadline);
        }

        uint256 amount = project.escrowAmount;
        address client = project.client;
        uint256 deadline = project.deadline;
        _allocateEscrow(project, client, ProjectState.Refunded);

        emit DeadlineRefunded(projectId, client, amount, deadline);
    }

    /// @notice Credits the developer after an undisputed review period expires.
    /// @dev Permissionless to call; the developer is the fixed beneficiary.
    ///      Anyone may trigger this allocation, but only the developer can
    ///      withdraw the resulting credit. No MON is transferred here.
    /// @param projectId Existing submitted project.
    function releaseAfterReview(
        uint256 projectId
    )
        external
        projectExists(projectId)
        inState(projectId, ProjectState.Submitted)
    {
        Project storage project = _projects[projectId];
        if (block.timestamp < project.reviewDeadline) {
            revert DeadlineNotReached(project.reviewDeadline);
        }

        uint256 amount = project.escrowAmount;
        address developer = project.developer;
        uint256 reviewDeadline = project.reviewDeadline;
        _allocateEscrow(project, developer, ProjectState.AutoReleased);

        emit ReviewTimedOut(projectId, developer, amount, reviewDeadline);
    }

    /// @notice Withdraws the caller's full claimable balance to a chosen address.
    /// @dev Pull payment separates project finalization from delivery of MON.
    ///      Effects happen before the external call. A failed transfer reverts
    ///      the credit update, so the caller can retry with another recipient.
    /// @param recipient Nonzero destination selected by the credit owner.
    function withdrawTo(address recipient) external nonReentrant {
        if (recipient == address(0)) revert ZeroAddressRecipient();

        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NoClaimableBalance(msg.sender);

        // Checks-effects-interactions: clear the credit and aggregate liability
        // before calling an untrusted recipient. Revert restores them on error.
        claimable[msg.sender] = 0;
        totalClaimable -= amount;

        (bool success, ) = payable(recipient).call{value: amount}("");
        if (!success) revert WithdrawalFailed(recipient, amount);

        emit Withdrawal(msg.sender, recipient, amount);
    }

    /// @notice Returns the complete record for an existing project.
    /// @param projectId Existing project ID.
    function getProject(
        uint256 projectId
    ) external view projectExists(projectId) returns (Project memory) {
        return _projects[projectId];
    }

    /// @notice Returns the number of projects created so far.
    function projectCount() external view returns (uint256) {
        return _projectCount;
    }

    /// @dev Moves an escrow liability to a pull-payment credit exactly once.
    ///      Callers must first enforce the project's expected state. Disputed
    ///      projects never call this helper and remain included in totalEscrowed.
    function _allocateEscrow(
        Project storage project,
        address beneficiary,
        ProjectState terminalState
    ) private {
        uint256 amount = project.escrowAmount;

        // Effects only; this helper does not transfer MON.
        project.state = terminalState;
        totalEscrowed -= amount;
        totalClaimable += amount;
        claimable[beneficiary] += amount;
    }
}
