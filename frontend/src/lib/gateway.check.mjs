// Run with: node src/lib/gateway.check.mjs
import assert from "node:assert/strict";
import * as g from "./gateway.js";

const C = "0x" + "c1".repeat(20), D = "0x" + "d2".repeat(20), X = "0x" + "e3".repeat(20);
const input = { name: "Bakery site", description: "A five page marketing site for a bakery.", pages: ["Home"], features: ["Contact form"],
  amount: "2", developerAddress: D, deadline: new Date(Date.now() + 864e5).toISOString() };
const rejects = async (p, code) => assert.equal(await p.then(() => null, (e) => e.code), code);

await rejects(g.createProject(input, ""), "NO_WALLET");
await assert.rejects(g.createProject({ ...input, developerAddress: C }, C), (e) => !!e.fieldErrors.developerAddress);

const p = await g.createProject(input, C);
assert.equal(p.status, "Funded");
assert.equal(p.description, undefined, "createProject must not return the brief");
assert.equal((await g.getProject(p.id)).pages, undefined, "public view must not include the brief");
await rejects(g.getBrief(p.id, X), "FORBIDDEN");
const brief = await g.getBrief(p.id, D);
assert.equal(brief.hashMatches, true);

assert.equal((await g.listProjectsForAddress(X)).length, 0);
assert.equal((await g.listProjectsForAddress(D)).length, 1);

await rejects(g.acceptProject(p.id, C, p.briefHash), "FORBIDDEN");
await rejects(g.acceptProject(p.id, D, "0xbad"), "HASH_MISMATCH");
assert.equal((await g.acceptProject(p.id, D, p.briefHash)).status, "In Progress");
await rejects(g.acceptProject(p.id, D, p.briefHash), "BAD_STATE");
await rejects(g.cancelProject(p.id, C), "BAD_STATE");

const q = await g.createProject(input, C);
await rejects(g.cancelProject(q.id, D), "FORBIDDEN");
assert.equal((await g.cancelProject(q.id, C)).status, "Refunded");
console.log("gateway checks passed");
