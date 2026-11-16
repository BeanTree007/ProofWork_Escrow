import { ethers } from 'ethers';
import { getProvider, getSigner } from './wallet';
import { getContractAddress, getRpcUrl } from './contractConfig';
import ABI from '../../contract-abi.json';

let readContract = null;

// Built per call: the signer changes when the user switches MetaMask accounts.
async function getContract() {
  const signer = await getSigner();
  return new ethers.Contract(getContractAddress(), ABI, signer);
}

// Turns contract reverts and wallet rejections into messages a person can act on.
const REVERT_MESSAGES = {
  ActionWindowClosed: 'The deadline for this action has passed.',
  DeadlineNotReached: 'The deadline has not passed yet.',
  ExtensionAlreadyPending: 'An extension request is already waiting for the client.',
  NoPendingExtension: 'There is no pending extension request.',
  InvalidRequestedDeadline: 'The new deadline must be later than the current deadline.',
  Unauthorized: 'This wallet is not allowed to do that for this project.',
  InvalidState: 'The project is not in the right state for that action.',
  InvalidStateForAction: 'The project is not in the right state for that action.',
  NoClaimableBalance: 'There is nothing to withdraw for this wallet.',
  ProjectNotFound: 'No project exists with this ID on the contract.',
  EmptyWebsiteURL: 'Enter a website URL.',
  WebsiteURLTooLong: 'The website URL is too long.',
  InvalidDeadline: 'Choose a deadline in the future.',
  InvalidDeveloper: 'Enter a valid developer address.',
  DeveloperCannotBeClient: 'The developer must be a different wallet from the client.',
  InvalidEscrowAmount: 'Enter an escrow amount greater than 0.',
};

export function describeTxError(err) {
  if (err?.code === 'ACTION_REJECTED' || err?.info?.error?.code === 4001) {
    return 'You rejected the transaction in your wallet. Nothing was sent.';
  }
  const name = err?.revert?.name;
  if (name && REVERT_MESSAGES[name]) return REVERT_MESSAGES[name];
  if (err?.code === 'INSUFFICIENT_FUNDS') return 'This wallet does not have enough MON for the amount and gas.';
  return err?.shortMessage || err?.message || 'The transaction failed.';
}

async function send(method, ...args) {
  const contract = await getContract();
  try {
    const tx = await contract[method](...args);
    const receipt = await tx.wait();
    return { txHash: receipt.hash, blockNumber: receipt.blockNumber, receipt, contract };
  } catch (err) {
    throw Object.assign(new Error(describeTxError(err)), { code: 'TX_FAILED', cause: err });
  }
}

async function getReadContract() {
  if (!readContract) {
    const provider = new ethers.JsonRpcProvider(getRpcUrl());
    const contractAddr = getContractAddress();
    readContract = new ethers.Contract(contractAddr, ABI, provider);
  }
  return readContract;
}

// PROJECT STATES
const PROJECT_STATES = {
  0: 'None',
  1: 'Funded',
  2: 'Submitted',
  3: 'Approved',
  4: 'AutoReleased',
  5: 'Disputed',
  6: 'Refunded',
};

function formatProjectResponse(project) {
  return {
    client: project.client,
    developer: project.developer,
    escrowAmount: project.escrowAmount.toString(),
    state: PROJECT_STATES[Number(project.state)] || 'Unknown',
    stateNum: Number(project.state),
    createdAt: Number(project.createdAt),
    deadline: Number(project.deadline),
    detailsHash: project.detailsHash,
    submittedAt: Number(project.submittedAt),
    reviewDeadline: Number(project.reviewDeadline),
    websiteURL: project.websiteURL,
    requestedDeadline: Number(project.requestedDeadline),
  };
}

/** Reads a project over the public RPC (no wallet needed). Resolves to null if it does not exist. */
export async function getProject(projectId) {
  const contract = await getReadContract();
  try {
    return formatProjectResponse(await contract.getProject(projectId));
  } catch (err) {
    if (err?.revert?.name === 'ProjectNotFound') return null;
    throw Object.assign(new Error('The Monad network could not be reached to read this project.'), { code: 'RPC_FAILED', cause: err });
  }
}

export async function getProjectCount() {
  const contract = await getReadContract();
  return Number(await contract.projectCount());
}

export async function createProject(developer, deadline, detailsHash, escrowAmount) {
  const contract = await getReadContract();

  // Validate inputs
  if (!ethers.isAddress(developer)) {
    throw new Error('Invalid developer address');
  }
  
  // Validate detailsHash is non-zero
  if (!detailsHash || detailsHash === '0x' || detailsHash === '0x0000000000000000000000000000000000000000000000000000000000000000') {
    throw new Error('Project details hash is required and cannot be empty');
  }
  
  const deadlineNum = BigInt(Math.floor(deadline));
  const amountBN = BigInt(escrowAmount);
  
  const { receipt } = await send('createProject', developer, deadlineNum, detailsHash, { value: amountBN });

  // Extract project ID from ProjectCreated event
  let projectId = null;
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === 'ProjectCreated') {
        projectId = parsed.args[0];
        break;
      }
    } catch {}
  }

  return {
    txHash: receipt.hash,
    projectId: projectId ? projectId.toString() : null,
    blockNumber: receipt.blockNumber,
  };
}

export async function submitWebsite(projectId, websiteURL) {
  if (!websiteURL || websiteURL.trim().length === 0) {
    throw new Error('Website URL is required');
  }
  
  const { txHash, blockNumber } = await send('submitWebsite', projectId, websiteURL);
  return { txHash, blockNumber };
}

export async function approveProject(projectId) {
  const { txHash, blockNumber } = await send('approveProject', projectId);
  return { txHash, blockNumber };
}

export async function disputeProject(projectId) {
  const { txHash, blockNumber } = await send('disputeProject', projectId);
  return { txHash, blockNumber };
}

export async function requestExtension(projectId, requestedDeadline) {
  const { txHash, blockNumber } = await send('requestExtension', projectId, BigInt(Math.floor(requestedDeadline)));
  return { txHash, blockNumber };
}

export async function respondToExtension(projectId, approve) {
  const { txHash, blockNumber } = await send('respondToExtension', projectId, approve);
  return { txHash, blockNumber };
}

export async function withdrawTo(recipient) {
  if (!ethers.isAddress(recipient)) {
    throw new Error('Invalid recipient address');
  }
  
  const { txHash, blockNumber } = await send('withdrawTo', recipient);
  return { txHash, blockNumber };
}

export async function refundAfterDeadline(projectId) {
  const { txHash, blockNumber } = await send('refundAfterDeadline', projectId);
  return { txHash, blockNumber };
}

export async function releaseAfterReview(projectId) {
  const { txHash, blockNumber } = await send('releaseAfterReview', projectId);
  return { txHash, blockNumber };
}

/** Native MON (in wei, as a bigint) this address can withdraw. */
export async function getClaimable(address) {
  const contract = await getReadContract();
  return contract.claimable(address);
}

export function getProjectStateName(stateNum) {
  return PROJECT_STATES[stateNum] || 'Unknown';
}
