// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ProofWorkEscrow} from "../src/ProofWorkEscrow.sol";

contract DeployProofWorkEscrow is Script {
    uint256 private constant DEFAULT_REVIEW_PERIOD = 7 days;
    uint256 private constant MONAD_TESTNET_CHAIN_ID = 10143;

    error UnsupportedChain(uint256 actualChainId);

    function run() external returns (ProofWorkEscrow escrow) {
        if (block.chainid != MONAD_TESTNET_CHAIN_ID) {
            revert UnsupportedChain(block.chainid);
        }

        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        uint256 reviewPeriod = vm.envOr(
            "REVIEW_PERIOD",
            DEFAULT_REVIEW_PERIOD
        );

        vm.startBroadcast(deployerPrivateKey);
        escrow = new ProofWorkEscrow(reviewPeriod);
        vm.stopBroadcast();

        console2.log("ProofWorkEscrow deployed at:", address(escrow));
        console2.log("Review period (seconds):", reviewPeriod);
    }
}
