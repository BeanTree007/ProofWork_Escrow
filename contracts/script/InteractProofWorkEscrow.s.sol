// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ProofWorkEscrow} from "../src/ProofWorkEscrow.sol";

contract InteractProofWorkEscrow is Script {
    uint256 private constant MONAD_TESTNET_CHAIN_ID = 10143;
    uint256 private constant DEFAULT_DEADLINE_OFFSET = 30 days;
    uint256 private constant DEFAULT_EXTENSION_SECONDS = 7 days;

    error UnsupportedChain(uint256 actualChainId);
    error ClientAndDeveloperMustDiffer();
    error InvalidInteractionSettings();

    function run() external returns (uint256 projectId) {
        if (block.chainid != MONAD_TESTNET_CHAIN_ID) {
            revert UnsupportedChain(block.chainid);
        }

        uint256 clientPrivateKey = vm.envUint("CLIENT_PRIVATE_KEY");
        uint256 developerPrivateKey = vm.envUint("DEVELOPER_PRIVATE_KEY");
        address client = vm.addr(clientPrivateKey);
        address developer = vm.addr(developerPrivateKey);
        if (client == developer) revert ClientAndDeveloperMustDiffer();

        address escrowAddress = vm.envAddress("ESCROW_ADDRESS");
        uint256 projectAmount = vm.envUint("PROJECT_AMOUNT_WEI");
        uint256 deadlineOffset = vm.envOr(
            "DEADLINE_OFFSET",
            DEFAULT_DEADLINE_OFFSET
        );
        uint256 extensionSeconds = vm.envOr(
            "EXTENSION_SECONDS",
            DEFAULT_EXTENSION_SECONDS
        );
        bytes32 detailsHash = vm.envBytes32("DETAILS_HASH");
        string memory websiteURL = vm.envString("WEBSITE_URL");

        if (
            escrowAddress == address(0) ||
            projectAmount == 0 ||
            deadlineOffset == 0 ||
            extensionSeconds == 0
        ) {
            revert InvalidInteractionSettings();
        }

        ProofWorkEscrow escrow = ProofWorkEscrow(escrowAddress);
        uint256 deadline = block.timestamp + deadlineOffset;

        vm.startBroadcast(clientPrivateKey);
        projectId = escrow.createProject{value: projectAmount}(
            developer,
            deadline,
            detailsHash
        );
        vm.stopBroadcast();

        ProofWorkEscrow.Project memory project = escrow.getProject(projectId);
        console2.log("Created project ID:", projectId);
        console2.log("Project escrow amount (wei):", project.escrowAmount);
        console2.log("Project deadline:", project.deadline);

        vm.startBroadcast(developerPrivateKey);
        escrow.requestExtension(projectId, deadline + extensionSeconds);
        vm.stopBroadcast();

        vm.startBroadcast(clientPrivateKey);
        escrow.respondToExtension(projectId, true);
        vm.stopBroadcast();

        vm.startBroadcast(developerPrivateKey);
        escrow.submitWebsite(projectId, websiteURL);
        vm.stopBroadcast();

        console2.log("Submitted website for project ID:", projectId);
    }
}
