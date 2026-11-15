// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ProofWorkEscrow} from "../src/ProofWorkEscrow.sol";
import {ProofWorkEscrowTestBase} from "./ProofWorkEscrowTestBase.sol";

contract ProofWorkEscrowReentrancyTest is ProofWorkEscrowTestBase {
    function testWithdrawalRejectsReentryAndPaysOnlyOnce() public {
        ReentrantReceiver receiver = new ReentrantReceiver(escrow);
        uint256 projectId =
            _createProjectFor(client, address(receiver), DEFAULT_ESCROW, block.timestamp + WORK_DURATION, DETAILS_HASH);

        vm.prank(address(receiver));
        escrow.submitWebsite(projectId, "https://proofwork.example");
        vm.prank(client);
        escrow.approveProject(projectId);
        assertEq(escrow.claimable(address(receiver)), DEFAULT_ESCROW);
        _assertAccountingInvariant();

        receiver.withdraw();

        assertFalse(receiver.reentrySucceeded());
        assertEq(uint256(uint32(receiver.reentryFailure())), uint256(uint32(ProofWorkEscrow.ReentrantCall.selector)));
        assertEq(address(receiver).balance, DEFAULT_ESCROW);
        assertEq(escrow.claimable(address(receiver)), 0);
        assertEq(escrow.totalClaimable(), 0);
        assertEq(address(escrow).balance, 0);
        _assertAccountingInvariant();
    }
}

/// @dev Attempts a nested withdrawal from the recipient callback and records
///      the result while allowing the original transfer to complete.
contract ReentrantReceiver {
    ProofWorkEscrow private immutable _escrow;

    bool public reentrySucceeded;
    bytes4 public reentryFailure;

    constructor(ProofWorkEscrow escrow_) {
        _escrow = escrow_;
    }

    function withdraw() external {
        _escrow.withdrawTo(address(this));
    }

    receive() external payable {
        (bool success, bytes memory returnData) =
            address(_escrow).call(abi.encodeWithSelector(_escrow.withdrawTo.selector, address(this)));
        reentrySucceeded = success;

        if (!success && returnData.length >= 4) {
            bytes4 failureSelector;
            assembly {
                failureSelector := mload(add(returnData, 32))
            }
            reentryFailure = failureSelector;
        }
    }
}
