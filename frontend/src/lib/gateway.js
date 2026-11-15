// Single seam between the pages and any backend or chain.
// DEMO MODE: projects live in this browser's localStorage and escrow funding is simulated.
// When src/services/ is ready, replace these function bodies; page code should not need to change.
import { STATUS, validateProjectInput } from "./projectModel";

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

export async function createProject(input) {
  const fieldErrors = validateProjectInput(input);
  if (Object.keys(fieldErrors).length) throw Object.assign(new Error("Invalid project"), { fieldErrors });
  await wait(700); // stands in for the wallet prompt and transaction
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

export async function listProjects() {
  return load();
}

export async function getProject(id) {
  return load().find((p) => p.id === id) ?? null;
}
