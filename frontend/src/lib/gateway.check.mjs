// Demo-mode rules of the gateway (no contract configured). Run with: npm run check
import assert from "node:assert/strict";

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const g = await import("./gateway.js");

const KEY = "proofwork.demo.projects";
const C = "0x" + "c1".repeat(20), D = "0x" + "d2".repeat(20), X = "0x" + "e3".repeat(20);
const DAY = 864e5;
const input = { name: "Bakery site", description: "A five page marketing site for a bakery.", pages: ["Home"], features: ["Contact form"],
  amount: "2", developerAddress: D, deadline: new Date(Date.now() + DAY).toISOString() };
const rejects = async (p, code) => assert.equal(await p.then(() => null, (e) => e.code), code);
// Moves a demo project's dates, standing in for time passing.
function edit(id, fields) {
  const list = JSON.parse(localStorage.getItem(KEY));
  Object.assign(list.find((p) => p.id === id), fields);
  localStorage.setItem(KEY, JSON.stringify(list));
}
const ago = (ms) => new Date(Date.now() - ms).toISOString();

assert.equal(g.chainMode(), false);
await rejects(g.createProject(input, ""), "NO_WALLET");
await assert.rejects(g.createProject({ ...input, developerAddress: C }, C), (e) => !!e.fieldErrors.developerAddress);

// Create, brief privacy, accept
const p = await g.createProject(input, C);
assert.equal(p.status, "Funded");
assert.equal(p.escrowSimulated, true);
assert.equal(p.description, undefined, "createProject must not return the brief");
assert.equal((await g.getProject(p.id)).pages, undefined, "public view must not include the brief");
assert.equal(await g.getProject("missing"), null);
await rejects(g.getBrief(p.id, X), "FORBIDDEN");
assert.equal((await g.getBrief(p.id, D)).hashMatches, true);
assert.equal((await g.listProjectsForAddress(X)).length, 0);
assert.equal((await g.listProjectsForAddress(D)).length, 1);

await rejects(g.submitWebsite(p.id, D, "https://example.com"), "BAD_STATE");
await rejects(g.acceptProject(p.id, C, p.briefHash), "FORBIDDEN");
await rejects(g.acceptProject(p.id, D, "0xbad"), "HASH_MISMATCH");
assert.equal((await g.acceptProject(p.id, D, p.briefHash)).status, "In Progress");
await rejects(g.acceptProject(p.id, D, p.briefHash), "BAD_STATE");
await rejects(g.cancelProject(p.id, C), "BAD_STATE");

// Extensions
const later = new Date(Date.now() + 3 * DAY).toISOString();
await rejects(g.requestExtension(p.id, C, later), "FORBIDDEN");
await rejects(g.requestExtension(p.id, D, ago(DAY)), "BAD_INPUT");
assert.deepEqual((await g.requestExtension(p.id, D, later)).extensionRequest, { requestedDeadline: later });
await rejects(g.requestExtension(p.id, D, later), "BAD_STATE");
await rejects(g.respondToExtension(p.id, D, true), "FORBIDDEN");
let after = await g.respondToExtension(p.id, C, true);
assert.equal(after.deadline, later);
assert.equal(after.extensionRequest, null);
await g.requestExtension(p.id, D, new Date(Date.now() + 5 * DAY).toISOString());
after = await g.respondToExtension(p.id, C, false);
assert.equal(after.deadline, later, "rejecting keeps the deadline");
await rejects(g.respondToExtension(p.id, C, true), "BAD_STATE");

// Submit, review window, approve
assert.equal(g.canRefund(after), false);
await rejects(g.refundAfterDeadline(p.id), "BAD_STATE");
await rejects(g.submitWebsite(p.id, C, "https://example.com"), "FORBIDDEN");
const sub = await g.submitWebsite(p.id, D, "https://example.com");
assert.equal(sub.status, "Submitted");
assert.ok(new Date(sub.reviewDeadline) > new Date(Date.now() + 6 * DAY));
await rejects(g.releaseAfterReview(p.id), "BAD_STATE");
await rejects(g.approveProject(p.id, D), "FORBIDDEN");
assert.equal((await g.approveProject(p.id, C)).status, "Approved");
await rejects(g.disputeProject(p.id, C), "BAD_STATE");

// Dispute
const d = await g.createProject(input, C);
await g.acceptProject(d.id, D, d.briefHash);
await g.submitWebsite(d.id, D, "https://example.com");
assert.equal((await g.disputeProject(d.id, C)).status, "Disputed");

// Review window expires: approve closes, anyone can release
const r = await g.createProject(input, C);
await g.acceptProject(r.id, D, r.briefHash);
await g.submitWebsite(r.id, D, "https://example.com");
edit(r.id, { reviewDeadline: ago(1000) });
await rejects(g.approveProject(r.id, C), "BAD_STATE");
assert.equal(g.canRelease(await g.getProject(r.id)), true);
assert.equal((await g.releaseAfterReview(r.id)).status, "Auto-released");

// Deadline passes without a submission: no submit or extension, anyone can refund
const e = await g.createProject(input, C);
await g.acceptProject(e.id, D, e.briefHash);
edit(e.id, { deadline: ago(1000) });
await rejects(g.submitWebsite(e.id, D, "https://example.com"), "BAD_STATE");
await rejects(g.requestExtension(e.id, D, later), "BAD_STATE");
assert.equal((await g.refundAfterDeadline(e.id)).status, "Refunded");

// Cancel before accept
const q = await g.createProject(input, C);
await rejects(g.cancelProject(q.id, D), "FORBIDDEN");
assert.equal((await g.cancelProject(q.id, C)).status, "Refunded");

// Withdrawals are on-chain only
assert.equal(await g.getClaimable(C), null);
await rejects(g.withdraw(C), "TEST_WALLET");
console.log("gateway checks passed");
