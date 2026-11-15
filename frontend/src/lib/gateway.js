// Single seam between the pages and blockchain/backend.
// Uses blockchain contract when available; falls back to demo mode.
import { STATUS, validateProjectInput } from "./projectModel";
import * as blockchain from "../services/blockchain";

const KEY = "proofwork.demo.projects";
let memory = [];
let useBlockchain = false;

// Try to detect if blockchain is configured
async function isBlockchainReady() {
  try {
    blockchain.getContractAddress();
    return true;
  } catch {
    return false;
  }
}

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

export async function createProject(input) {
  const fieldErrors = validateProjectInput(input);
  if (Object.keys(fieldErrors).length) throw Object.assign(new Error("Invalid project"), { fieldErrors });

  const ready = await isBlockchainReady();
  
  if (ready && blockchain.isConnected()) {
    // Use real blockchain
    const developerAddress = input.developerAddress.trim();
    const amountMON = parseFloat(input.amount);
    const deadlineTs = Math.floor(new Date(input.deadline).getTime() / 1000);
    const detailsHash = "0x" + Array(64).fill("0").join(""); // Placeholder hash
    
    // Convert MON to wei (18 decimals)
    const amountWei = BigInt(Math.floor(amountMON * 1e18)).toString();
    
    const result = await blockchain.createProject(
      developerAddress,
      deadlineTs,
      detailsHash,
      amountWei
    );

    return {
      id: result.projectId || "pending",
      name: input.name.trim(),
      description: input.description.trim(),
      pages: input.pages,
      features: input.features,
      amount: input.amount.trim(),
      developerAddress: developerAddress,
      deadline: new Date(input.deadline).toISOString(),
      status: STATUS.FUNDED,
      onChain: true,
      txHash: result.txHash,
      createdAt: new Date().toISOString(),
      extensions: [],
    };
  } else {
    // Demo mode
    await wait(700);
    const project = {
      id: crypto.randomUUID().slice(0, 8),
      name: input.name.trim(),
      description: input.description.trim(),
      pages: input.pages,
      features: input.features,
      amount: String(input.amount).trim(),
      developerAddress: input.developerAddress.trim(),
      deadline: new Date(input.deadline).toISOString(),
      status: STATUS.FUNDED,
      escrowSimulated: true,
      createdAt: new Date().toISOString(),
      extensions: [],
    };
    save([project, ...load()]);
    return project;
  }
}

export async function listProjects() {
  return load();
}

export async function getProject(id) {
  const ready = await isBlockchainReady();
  
  if (ready) {
    try {
      // Try to fetch from blockchain
      const onChainProject = await blockchain.getProject(parseInt(id));
      return {
        id: id,
        client: onChainProject.client,
        developer: onChainProject.developer,
        amount: (BigInt(onChainProject.escrowAmount) / BigInt(1e18)).toString(),
        escrowAmount: onChainProject.escrowAmount,
        status: onChainProject.state,
        state: onChainProject.state,
        deadline: new Date(onChainProject.deadline * 1000).toISOString(),
        websiteURL: onChainProject.websiteURL || null,
        onChain: true,
        createdAt: new Date(onChainProject.createdAt * 1000).toISOString(),
      };
    } catch (error) {
      // Fall back to demo
      console.warn("Failed to fetch from blockchain, using demo:", error);
    }
  }
  
  // Demo mode or fallback
  return load().find((p) => p.id === id) ?? null;
}
