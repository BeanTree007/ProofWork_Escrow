// Single seam between the pages and blockchain/backend.
// When wallet is connected: calls real blockchain functions
// When wallet disconnected: falls back to demo mode (localStorage)
import { STATUS, validateProjectInput, computeBriefHash, roleFor, sameAddress } from "./projectModel.js";
import { ethers } from "ethers";
import * as blockchain from "../services/blockchain";

const KEY = "proofwork.demo.projects";
let memory = [];

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? [];
  } catch {
    return memory;
  }
}

function save(list) {
  memory = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable: memory copy is used */
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (code, message) => Object.assign(new Error(message || code), { code });
const publicView = ({ description, pages, features, ...rest }) => rest;

function change(id, fn) {
  const list = load();
  const i = list.findIndex((p) => p.id === id);
  if (i < 0) throw fail("NOT_FOUND", "Project not found.");
  list[i] = fn(list[i]);
  save(list);
  return publicView(list[i]);
}

// Demo projects need the developer to accept first; the deployed contract has no accept step.
export function canWork(p) {
  return p.status === STATUS.IN_PROGRESS || (p.onChain && p.status === STATUS.FUNDED);
}

// Check if blockchain is available and wallet is connected
function isBlockchainReady() {
  try {
    const addr = blockchain.getConnectedAccount();
    return !!addr;
  } catch {
    return false;
  }
}

export async function createProject(input, clientAddress) {
  if (!clientAddress) throw fail("NO_WALLET", "Connect a wallet to fund escrow.");
  const fieldErrors = validateProjectInput(input, Date.now(), clientAddress);
  if (Object.keys(fieldErrors).length) throw Object.assign(new Error("Invalid project"), { fieldErrors });
  
  const useChain = isBlockchainReady();
  
  if (useChain) {
    // Blockchain mode: create real on-chain project
    try {
      const developerAddress = input.developerAddress.trim();
      const amountMON = parseFloat(input.amount);
      const deadlineTs = Math.floor(new Date(input.deadline).getTime() / 1000);
      
      // Create brief hash from project details
      const brief = { description: input.description.trim(), pages: input.pages, features: input.features };
      const detailsHash = await computeBriefHash(brief);
      
      // Convert MON to wei (18 decimals)
      const amountWei = BigInt(Math.floor(amountMON * 1e18)).toString();
      
      const result = await blockchain.createProject(
        developerAddress,
        deadlineTs,
        detailsHash,
        amountWei
      );

      const project = {
        id: result.projectId,
        name: input.name.trim(),
        description: input.description.trim(),
        pages: input.pages,
        features: input.features,
        briefHash: detailsHash,
        amount: String(amountMON),
        clientAddress,
        developerAddress,
        deadline: new Date(input.deadline).toISOString(),
        status: STATUS.FUNDED,
        onChain: true,
        txHash: result.txHash,
        createdAt: new Date().toISOString(),
        acceptedAt: null,
        extensions: [],
      };
      save([project, ...load().filter((p) => p.id !== project.id)]);
      return publicView(project);
    } catch (err) {
      console.error("Blockchain create failed, falling back to demo:", err);
      // Fall through to demo mode
    }
  }
  
  // Demo mode: create in localStorage
  await wait(700);
  const brief = { description: input.description.trim(), pages: input.pages, features: input.features };
  const project = {
    id: crypto.randomUUID().slice(0, 8),
    name: input.name.trim(),
    ...brief,
    briefHash: await computeBriefHash(brief),
    amount: String(input.amount).trim(),
    clientAddress,
    developerAddress: input.developerAddress.trim(),
    deadline: new Date(input.deadline).toISOString(),
    status: STATUS.FUNDED,
    escrowSimulated: true,
    createdAt: new Date().toISOString(),
    acceptedAt: null,
    extensions: [],
  };
  save([project, ...load()]);
  return publicView(project);
}

export async function listProjectsForAddress(address) {
  return load().filter((p) => roleFor(p, address) !== "other").map(publicView);
}

export async function getProject(id) {
  const useChain = isBlockchainReady();
  
  if (useChain) {
    try {
      // Try to fetch from blockchain
      const onChainProject = await blockchain.getProject(parseInt(id));
      const local = load().find((x) => x.id === id);
      return publicView({
        name: `Project ${id}`,
        extensions: [],
        ...local,
        id,
        clientAddress: onChainProject.client,
        developerAddress: onChainProject.developer,
        amount: ethers.formatEther(onChainProject.escrowAmount),
        escrowAmount: onChainProject.escrowAmount,
        status: onChainProject.state,
        deadline: new Date(onChainProject.deadline * 1000).toISOString(),
        websiteURL: onChainProject.websiteURL || null,
        onChain: true,
        createdAt: new Date(onChainProject.createdAt * 1000).toISOString(),
      });
    } catch (error) {
      console.warn("Failed to fetch from blockchain, using demo:", error);
    }
  }
  
  // Demo mode or fallback
  const p = load().find((x) => x.id === id);
  return p ? publicView(p) : null;
}

export async function getBrief(id, address) {
  const p = load().find((x) => x.id === id);
  if (!p) throw fail("NOT_FOUND", "Project not found.");
  if (roleFor(p, address) === "other") throw fail("FORBIDDEN", "This wallet is not part of the project.");
  const brief = { description: p.description, pages: p.pages, features: p.features };
  return { ...brief, hashMatches: (await computeBriefHash(brief)) === p.briefHash };
}

export async function approveProject(id, address) {
  const useChain = isBlockchainReady();
  
  if (useChain) {
    try {
      await blockchain.approveProject(parseInt(id));
      // Return updated project from blockchain
      return getProject(id);
    } catch (err) {
      console.error("Blockchain approve failed, falling back to demo:", err);
    }
  }
  
  // Demo mode
  await wait(600);
  return change(id, (p) => {
    if (!sameAddress(address, p.clientAddress)) throw fail("FORBIDDEN", "Only the client can approve this project.");
    if (p.status !== STATUS.SUBMITTED) throw fail("BAD_STATE", "Project must be in submitted state to approve.");
    return { ...p, status: STATUS.APPROVED };
  });
}

export async function disputeProject(id, address) {
  const useChain = isBlockchainReady();
  
  if (useChain) {
    try {
      await blockchain.disputeProject(parseInt(id));
      return getProject(id);
    } catch (err) {
      console.error("Blockchain dispute failed, falling back to demo:", err);
    }
  }
  
  // Demo mode
  await wait(600);
  return change(id, (p) => {
    if (!sameAddress(address, p.clientAddress)) throw fail("FORBIDDEN", "Only the client can dispute this project.");
    if (p.status !== STATUS.SUBMITTED) throw fail("BAD_STATE", "Project must be submitted before dispute.");
    return { ...p, status: STATUS.DISPUTED };
  });
}

export async function submitWebsite(id, address, websiteURL) {
  const useChain = isBlockchainReady();
  
  if (useChain) {
    try {
      await blockchain.submitWebsite(parseInt(id), websiteURL);
      return getProject(id);
    } catch (err) {
      console.error("Blockchain submit failed, falling back to demo:", err);
    }
  }
  
  // Demo mode
  await wait(600);
  return change(id, (p) => {
    if (!sameAddress(address, p.developerAddress)) throw fail("FORBIDDEN", "Only the developer can submit the website.");
    if (!canWork(p)) throw fail("BAD_STATE", "Accept the project before submitting a website.");
    return { ...p, status: STATUS.SUBMITTED, websiteURL };
  });
}

export async function requestExtension(id, address, requestedDeadline) {
  const useChain = isBlockchainReady();
  
  if (useChain) {
    try {
      const deadlineTs = Math.floor(new Date(requestedDeadline).getTime() / 1000);
      await blockchain.requestExtension(parseInt(id), deadlineTs);
      return getProject(id);
    } catch (err) {
      console.error("Blockchain extension request failed, falling back to demo:", err);
    }
  }
  
  // Demo mode
  await wait(600);
  return change(id, (p) => {
    if (!sameAddress(address, p.developerAddress)) throw fail("FORBIDDEN", "Only the developer can request extension.");
    if (!canWork(p)) throw fail("BAD_STATE", "Accept the project before requesting an extension.");
    return { ...p, extensionPending: true, extensionRequest: { requestedDeadline } };
  });
}

export async function respondToExtension(id, address, approve) {
  const useChain = isBlockchainReady();
  
  if (useChain) {
    try {
      await blockchain.respondToExtension(parseInt(id), approve);
      return getProject(id);
    } catch (err) {
      console.error("Blockchain extension response failed, falling back to demo:", err);
    }
  }
  
  // Demo mode
  await wait(600);
  return change(id, (p) => {
    if (!sameAddress(address, p.clientAddress)) throw fail("FORBIDDEN", "Only the client can respond to extension.");
    if (!p.extensionPending) throw fail("BAD_STATE", "No pending extension request.");
    if (approve) {
      return { ...p, deadline: p.extensionRequest.requestedDeadline, extensionPending: false, extensionRequest: null };
    }
    return { ...p, extensionPending: false, extensionRequest: null };
  });
}

// Demo only: the deployed contract has no accept step (on-chain projects are workable once funded).
export async function acceptProject(id, address, briefHash) {
  await wait(600);
  return change(id, (p) => {
    if (p.onChain) throw fail("BAD_STATE", "On-chain projects do not need to be accepted.");
    if (!sameAddress(address, p.developerAddress)) throw fail("FORBIDDEN", "Only the developer can accept this project.");
    if (p.status !== STATUS.FUNDED) throw fail("BAD_STATE", "Only funded projects can be accepted.");
    if (briefHash !== p.briefHash) throw fail("HASH_MISMATCH", "The brief does not match the contract.");
    return { ...p, status: STATUS.IN_PROGRESS, acceptedAt: new Date().toISOString() };
  });
}

// Demo only: the client can cancel and get a refund until the developer accepts.
export async function cancelProject(id, address) {
  await wait(600);
  return change(id, (p) => {
    if (p.onChain) throw fail("BAD_STATE", "The deployed contract does not support cancelling. Funds can be reclaimed after the deadline.");
    if (!sameAddress(address, p.clientAddress)) throw fail("FORBIDDEN", "Only the client can cancel this project.");
    if (p.status !== STATUS.FUNDED) throw fail("BAD_STATE", "Projects can only be cancelled before the developer accepts.");
    return { ...p, status: STATUS.REFUNDED };
  });
}
