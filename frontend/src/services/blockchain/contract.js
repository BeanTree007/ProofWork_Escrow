import { ethers } from 'ethers';
import { getProvider, getSigner } from './wallet';
import { getContractAddress, getRpcUrl } from './contractConfig';
import ABI from '../../contract-abi.json';

let contractInstance = null;
let readContract = null;

async function getContract() {
  if (!contractInstance) {
    const signer = await getSigner();
    const contractAddr = getContractAddress();
    contractInstance = new ethers.Contract(contractAddr, ABI, signer);
  }
  return contractInstance;
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

export async function getProject(projectId) {
  const contract = await getReadContract();
  const project = await contract.getProject(projectId);
  return formatProjectResponse(project);
}

export async function createProject(developer, deadline, detailsHash, escrowAmount) {
  const contract = await getContract();
  
  // Validate inputs
  if (!ethers.isAddress(developer)) {
    throw new Error('Invalid developer address');
  }
  
  const deadlineNum = BigInt(Math.floor(deadline));
  const amountBN = BigInt(escrowAmount);
  
  // Call contract
  const tx = await contract.createProject(
    developer,
    deadlineNum,
    detailsHash || '0x0000000000000000000000000000000000000000000000000000000000000000',
    { value: amountBN }
  );

  // Wait for confirmation
  const receipt = await tx.wait();
  
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
  const contract = await getContract();
  
  if (!websiteURL || websiteURL.trim().length === 0) {
    throw new Error('Website URL is required');
  }
  
  const tx = await contract.submitWebsite(projectId, websiteURL);
  const receipt = await tx.wait();
  
  return {
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };
}

export async function approveProject(projectId) {
  const contract = await getContract();
  const tx = await contract.approveProject(projectId);
  const receipt = await tx.wait();
  
  return {
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };
}

export async function disputeProject(projectId) {
  const contract = await getContract();
  const tx = await contract.disputeProject(projectId);
  const receipt = await tx.wait();
  
  return {
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };
}

export async function requestExtension(projectId, requestedDeadline) {
  const contract = await getContract();
  const tx = await contract.requestExtension(projectId, BigInt(Math.floor(requestedDeadline)));
  const receipt = await tx.wait();
  
  return {
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };
}

export async function respondToExtension(projectId, approve) {
  const contract = await getContract();
  const tx = await contract.respondToExtension(projectId, approve);
  const receipt = await tx.wait();
  
  return {
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };
}

export async function withdrawTo(recipient) {
  const contract = await getContract();
  
  if (!ethers.isAddress(recipient)) {
    throw new Error('Invalid recipient address');
  }
  
  const tx = await contract.withdrawTo(recipient);
  const receipt = await tx.wait();
  
  return {
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };
}

export function getProjectStateName(stateNum) {
  return PROJECT_STATES[stateNum] || 'Unknown';
}
