// Single seam between the pages and any backend or chain.
// DEMO MODE: projects live in this browser's localStorage and chain actions are simulated.
// When src/services/ is ready, replace these function bodies; page code should not need to change.
// Access model: public fields (status, amount, deadline, addresses, briefHash) are open;
// the brief (description, pages, features) is returned only to the client or developer address.
import { STATUS, validateProjectInput, computeBriefHash, roleFor, sameAddress } from "./projectModel.js";

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

export async function createProject(input, clientAddress) {
  if (!clientAddress) throw fail("NO_WALLET", "Connect a wallet to fund escrow.");
  const fieldErrors = validateProjectInput(input, Date.now(), clientAddress);
  if (Object.keys(fieldErrors).length) throw Object.assign(new Error("Invalid project"), { fieldErrors });
  await wait(700); // stands in for the wallet prompt and transaction
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
    status: STATUS.FUNDED, // funded, waiting for the developer to accept
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

export async function acceptProject(id, address, briefHash) {
  await wait(600);
  return change(id, (p) => {
    if (!sameAddress(address, p.developerAddress)) throw fail("FORBIDDEN", "Only the developer wallet can accept this project.");
    if (p.status !== STATUS.FUNDED) throw fail("BAD_STATE", "This project is no longer waiting for acceptance.");
    if (Date.now() >= Date.parse(p.deadline)) throw fail("EXPIRED", "The deadline has passed, so the project can no longer be accepted.");
    if (briefHash !== p.briefHash) throw fail("HASH_MISMATCH", "The brief does not match the contract. Reload and review it again.");
    return { ...p, status: STATUS.IN_PROGRESS, acceptedAt: new Date().toISOString() };
  });
}

export async function cancelProject(id, address) {
  await wait(600);
  return change(id, (p) => {
    if (!sameAddress(address, p.clientAddress)) throw fail("FORBIDDEN", "Only the client wallet can cancel this project.");
    if (p.status !== STATUS.FUNDED) throw fail("BAD_STATE", "Only a project that has not been accepted can be cancelled.");
    return { ...p, status: STATUS.REFUNDED };
  });
}
