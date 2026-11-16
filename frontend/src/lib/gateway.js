// Single seam between the pages and the escrow (Monad contract or demo mode).
//
// Two kinds of project:
// - On-chain: created with a real wallet when VITE_CONTRACT_ADDRESS is set. The contract is
//   the source of truth; every action is a transaction and failures are reported, never faked.
//   Reads use the public RPC, so anyone with the link can view the project without a wallet.
//   The brief (requirements) is shared through the backend, keyed by the contract's detailsHash.
// - Demo: created with a test wallet (or when no contract is configured). Stored in this
//   browser's localStorage only, and every page labels it as simulated.
import { ethers } from "ethers";
import { REVIEW_WINDOW_DAYS, STATUS, computeBriefHash, roleFor, sameAddress, validateProjectInput } from "./projectModel.js";
import { fetchBrief, putBrief } from "./briefApi.js";
import * as chain from "../services/blockchain/contract.js";
import { isChainConfigured } from "../services/blockchain/contractConfig.js";
import { getTestWallet } from "../services/blockchain/useBlockchainWallet.js";

const KEY = "proofwork.demo.projects";
const DAY = 864e5;
const DASHBOARD_SCAN_LIMIT = 200; // most recent on-chain projects checked for the dashboard
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
const find = (id) => load().find((p) => p.id === id);
const isPast = (iso, now = Date.now()) => !!iso && new Date(iso).getTime() <= now;

function change(id, fn) {
  const list = load();
  const i = list.findIndex((p) => p.id === id);
  if (i < 0) throw fail("NOT_FOUND", "Project not found.");
  list[i] = fn(list[i]);
  save(list);
  return publicView(list[i]);
}

function remember(id, fields) {
  const list = load();
  const i = list.findIndex((p) => p.id === id);
  if (i >= 0) list[i] = { ...list[i], ...fields };
  else list.unshift({ id, ...fields });
  save(list);
}

/** On-chain transactions need a real wallet; demo mode is used with a test wallet or no contract. */
export function chainMode() {
  return isChainConfigured() && !getTestWallet();
}

// Demo projects need the developer to accept first; the deployed contract has no accept step.
export function canWork(p) {
  if (!p) return false;
  const open = p.status === STATUS.IN_PROGRESS || (p.onChain && p.status === STATUS.FUNDED);
  return open && !isPast(p.deadline);
}

/** Settlement actions anyone may trigger once a deadline passes. */
export function canRefund(p, now = Date.now()) {
  return !!p && (p.status === STATUS.FUNDED || p.status === STATUS.IN_PROGRESS) && isPast(p.deadline, now);
}

export function canRelease(p, now = Date.now()) {
  return !!p && p.status === STATUS.SUBMITTED && isPast(p.reviewDeadline, now);
}

export function canReview(p, now = Date.now()) {
  return !!p && p.status === STATUS.SUBMITTED && !isPast(p.reviewDeadline, now);
}

// ----- on-chain mapping -----

const CHAIN_STATUS = {
  Funded: STATUS.FUNDED,
  Submitted: STATUS.SUBMITTED,
  Approved: STATUS.APPROVED,
  AutoReleased: STATUS.AUTO_RELEASED,
  Disputed: STATUS.DISPUTED,
  Refunded: STATUS.REFUNDED,
};
const iso = (seconds) => (seconds ? new Date(seconds * 1000).toISOString() : null);

function fromChain(id, c, local) {
  return {
    id,
    name: local?.name || `Project ${id}`,
    onChain: true,
    txHash: local?.txHash,
    clientAddress: c.client,
    developerAddress: c.developer,
    amount: ethers.formatEther(c.escrowAmount),
    status: CHAIN_STATUS[c.state] ?? c.state,
    createdAt: iso(c.createdAt),
    deadline: iso(c.deadline),
    briefHash: c.detailsHash,
    websiteURL: c.websiteURL || null,
    submittedAt: iso(c.submittedAt),
    reviewDeadline: iso(c.reviewDeadline),
    extensionRequest: c.requestedDeadline ? { requestedDeadline: iso(c.requestedDeadline) } : null,
  };
}

async function readChainProject(id) {
  if (!isChainConfigured() || !/^\d+$/.test(id)) return null;
  const c = await chain.getProject(BigInt(id));
  if (!c) return null;
  const local = find(id);
  const project = fromChain(id, c, local);
  if (!local?.name) {
    // The name lives with the brief on the server; it is display-only.
    const brief = await fetchBrief(project.briefHash).catch(() => null);
    if (brief?.name) {
      project.name = brief.name;
      remember(id, { name: brief.name, onChain: true });
    }
  }
  return project;
}

/**
 * Runs an action on an existing project. Demo projects change localStorage after the demo
 * rules check; on-chain projects send the transaction and re-read the contract.
 */
async function act(id, { onChain, demo }) {
  const local = find(id);
  if (local && !local.onChain) {
    await wait(600);
    return change(id, demo);
  }
  if (!isChainConfigured()) throw fail("NOT_FOUND", "Project not found.");
  if (getTestWallet()) {
    throw fail("TEST_WALLET", "Test wallets cannot sign transactions. Disconnect it and connect MetaMask to act on an on-chain project.");
  }
  await onChain(BigInt(id));
  return readChainProject(id);
}

// ----- projects -----

export async function createProject(input, clientAddress) {
  if (!clientAddress) throw fail("NO_WALLET", "Connect a wallet to fund escrow.");
  const fieldErrors = validateProjectInput(input, Date.now(), clientAddress);
  if (Object.keys(fieldErrors).length) throw Object.assign(new Error("Invalid project"), { fieldErrors });

  const name = input.name.trim();
  const brief = { description: input.description.trim(), pages: input.pages, features: input.features };
  const briefHash = await computeBriefHash(brief);
  const developerAddress = input.developerAddress.trim();
  const amount = String(input.amount).trim();
  const deadline = new Date(input.deadline).toISOString();

  if (chainMode()) {
    // Share the brief first so the developer can read it as soon as the project exists.
    // It is stored under its own hash, so storing it before funding reveals nothing extra.
    let briefWarning = null;
    try {
      await putBrief(briefHash, { name, ...brief });
    } catch (e) {
      briefWarning = `${e.message} The developer will not see the requirements until the brief is shared from this browser (open the project page to retry).`;
    }

    const result = await chain.createProject(
      developerAddress,
      Math.floor(new Date(deadline).getTime() / 1000),
      briefHash,
      ethers.parseEther(amount).toString(),
    );
    if (!result.projectId) throw fail("TX_FAILED", `The transaction ${result.txHash} succeeded but no ProjectCreated event was found.`);

    const project = {
      id: result.projectId,
      name,
      ...brief,
      briefHash,
      amount,
      clientAddress,
      developerAddress,
      deadline,
      status: STATUS.FUNDED,
      onChain: true,
      txHash: result.txHash,
      createdAt: new Date().toISOString(),
      briefShared: !briefWarning,
      extensionRequest: null,
    };
    save([project, ...load().filter((p) => p.id !== project.id)]);
    return { ...publicView(project), briefWarning };
  }

  await wait(700);
  const project = {
    id: `demo-${crypto.randomUUID().slice(0, 8)}`,
    name,
    ...brief,
    briefHash,
    amount,
    clientAddress,
    developerAddress,
    deadline,
    status: STATUS.FUNDED,
    escrowSimulated: true,
    createdAt: new Date().toISOString(),
    acceptedAt: null,
    extensionRequest: null,
  };
  save([project, ...load()]);
  return publicView(project);
}

export async function listProjectsForAddress(address) {
  const demo = load().filter((p) => !p.onChain && roleFor(p, address) !== "other").map(publicView);
  if (!isChainConfigured()) return demo;

  const count = await chain.getProjectCount();
  const ids = [];
  for (let i = count; i >= 1 && ids.length < DASHBOARD_SCAN_LIMIT; i--) ids.push(i);
  const found = [];
  for (let i = 0; i < ids.length; i += 20) {
    const batch = await Promise.all(ids.slice(i, i + 20).map((n) => chain.getProject(BigInt(n)).then((c) => c && [String(n), c])));
    for (const entry of batch) {
      if (!entry) continue;
      const [id, c] = entry;
      if (sameAddress(c.client, address) || sameAddress(c.developer, address)) found.push(fromChain(id, c, find(id)));
    }
  }
  return [...found, ...demo];
}

/** Resolves to the project, or null if it does not exist. Throws if the network is unreachable. */
export async function getProject(id) {
  const local = find(id);
  if (local && !local.onChain) return publicView(local);
  return readChainProject(id);
}

/**
 * The brief, for the client or developer. `hashMatches` compares it with the hash the
 * contract (or the demo record) was created with.
 */
export async function getBrief(id, address) {
  const project = await getProject(id);
  if (!project) throw fail("NOT_FOUND", "Project not found.");
  if (roleFor(project, address) === "other") throw fail("FORBIDDEN", "This wallet is not part of the project.");

  const local = find(id);
  let brief = local?.description ? { description: local.description, pages: local.pages, features: local.features } : null;
  if (project.onChain) {
    const shared = await fetchBrief(project.briefHash);
    if (shared) brief = { description: shared.description, pages: shared.pages, features: shared.features };
    else if (brief && sameAddress(address, project.clientAddress)) {
      // The client still has the brief locally (sharing failed at creation): share it now.
      await putBrief(project.briefHash, { name: local.name || "", ...brief }).then(() => remember(id, { briefShared: true })).catch(() => {});
    }
  }
  if (!brief) {
    throw fail("BRIEF_MISSING", "The requirements for this project have not been shared yet. Ask the client to open this project page in the browser they created it from.");
  }
  return { ...brief, hashMatches: (await computeBriefHash(brief)) === project.briefHash };
}

export async function submitWebsite(id, address, websiteURL) {
  return act(id, {
    onChain: (n) => chain.submitWebsite(n, websiteURL),
    demo: (p) => {
      if (!sameAddress(address, p.developerAddress)) throw fail("FORBIDDEN", "Only the developer can submit the website.");
      if (!canWork(p)) throw fail("BAD_STATE", isPast(p.deadline) ? "The deadline has passed." : "Accept the project before submitting a website.");
      const now = Date.now();
      return {
        ...p,
        status: STATUS.SUBMITTED,
        websiteURL,
        submittedAt: new Date(now).toISOString(),
        reviewDeadline: new Date(now + REVIEW_WINDOW_DAYS * DAY).toISOString(),
        extensionRequest: null,
      };
    },
  });
}

export async function approveProject(id, address) {
  return act(id, {
    onChain: (n) => chain.approveProject(n),
    demo: (p) => {
      if (!sameAddress(address, p.clientAddress)) throw fail("FORBIDDEN", "Only the client can approve this project.");
      if (!canReview(p)) throw fail("BAD_STATE", "The project must be submitted and inside the review window to approve.");
      return { ...p, status: STATUS.APPROVED };
    },
  });
}

export async function disputeProject(id, address) {
  return act(id, {
    onChain: (n) => chain.disputeProject(n),
    demo: (p) => {
      if (!sameAddress(address, p.clientAddress)) throw fail("FORBIDDEN", "Only the client can dispute this project.");
      if (!canReview(p)) throw fail("BAD_STATE", "The project must be submitted and inside the review window to dispute.");
      return { ...p, status: STATUS.DISPUTED };
    },
  });
}

export async function requestExtension(id, address, requestedDeadline) {
  const requested = new Date(requestedDeadline);
  if (Number.isNaN(requested.getTime())) throw fail("BAD_INPUT", "Choose a new deadline.");
  return act(id, {
    onChain: (n) => chain.requestExtension(n, Math.floor(requested.getTime() / 1000)),
    demo: (p) => {
      if (!sameAddress(address, p.developerAddress)) throw fail("FORBIDDEN", "Only the developer can request an extension.");
      if (!canWork(p)) throw fail("BAD_STATE", isPast(p.deadline) ? "The deadline has passed." : "Accept the project before requesting an extension.");
      if (p.extensionRequest) throw fail("BAD_STATE", "An extension request is already waiting for the client.");
      if (requested <= new Date(p.deadline)) throw fail("BAD_INPUT", "The new deadline must be later than the current deadline.");
      return { ...p, extensionRequest: { requestedDeadline: requested.toISOString() } };
    },
  });
}

export async function respondToExtension(id, address, approve) {
  return act(id, {
    onChain: (n) => chain.respondToExtension(n, approve),
    demo: (p) => {
      if (!sameAddress(address, p.clientAddress)) throw fail("FORBIDDEN", "Only the client can respond to an extension request.");
      if (!p.extensionRequest) throw fail("BAD_STATE", "There is no pending extension request.");
      if (isPast(p.deadline)) throw fail("BAD_STATE", "The deadline has passed.");
      return { ...p, deadline: approve ? p.extensionRequest.requestedDeadline : p.deadline, extensionRequest: null };
    },
  });
}

/** After the deadline with no submission, anyone can return the escrow to the client. */
export async function refundAfterDeadline(id) {
  return act(id, {
    onChain: (n) => chain.refundAfterDeadline(n),
    demo: (p) => {
      if (!canRefund(p)) throw fail("BAD_STATE", "A refund is available only after the deadline passes without a submission.");
      return { ...p, status: STATUS.REFUNDED, extensionRequest: null };
    },
  });
}

/** After the review window with no decision, anyone can release the escrow to the developer. */
export async function releaseAfterReview(id) {
  return act(id, {
    onChain: (n) => chain.releaseAfterReview(n),
    demo: (p) => {
      if (!canRelease(p)) throw fail("BAD_STATE", "Funds can be released only after the review window ends without a decision.");
      return { ...p, status: STATUS.AUTO_RELEASED };
    },
  });
}

/** MON this wallet can withdraw from the contract, as a decimal string, or null when not applicable. */
export async function getClaimable(address) {
  if (!address || !chainMode()) return null;
  return ethers.formatEther(await chain.getClaimable(address));
}

export async function withdraw(address, recipient = address) {
  if (!chainMode()) throw fail("TEST_WALLET", "Withdrawals need MetaMask on Monad testnet.");
  return chain.withdrawTo(recipient);
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
