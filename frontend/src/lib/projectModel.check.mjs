// Run with: node src/lib/projectModel.check.mjs
import assert from "node:assert/strict";
import { validateProjectInput, computeBriefHash, roleFor } from "./projectModel.js";

const now = Date.parse("2026-11-15T12:00:00Z");
const good = {
  name: "Bakery site", description: "A five page marketing site for a bakery.",
  pages: ["Home"], features: ["Contact form"], amount: "2.5",
  developerAddress: "0x" + "a1".repeat(20), deadline: "2026-12-01T12:00:00Z",
};
assert.deepEqual(validateProjectInput(good, now), {});
assert.ok(validateProjectInput({ ...good, amount: "0" }, now).amount);
assert.ok(validateProjectInput({ ...good, amount: "-1" }, now).amount);
assert.ok(validateProjectInput({ ...good, amount: "abc" }, now).amount);
assert.ok(validateProjectInput({ ...good, amount: "1.0000000000000000001" }, now).amount);
assert.ok(validateProjectInput({ ...good, developerAddress: "0x123" }, now).developerAddress);
assert.ok(validateProjectInput({ ...good, deadline: "2026-11-01T00:00:00Z" }, now).deadline);
assert.ok(validateProjectInput({ ...good, deadline: "" }, now).deadline);
assert.ok(validateProjectInput({ ...good, pages: [] }, now).pages);
assert.ok(validateProjectInput({ ...good, name: "ab" }, now).name);
assert.ok(validateProjectInput(good, now, good.developerAddress.toUpperCase().replace("0X", "0x")).developerAddress, "developer must differ from client");
const brief = { description: "A five page marketing site.", pages: ["Home"], features: ["Form"] };
assert.equal(await computeBriefHash(brief), await computeBriefHash({ ...brief }));
assert.notEqual(await computeBriefHash(brief), await computeBriefHash({ ...brief, pages: ["Home", "About"] }));
assert.equal(roleFor({ clientAddress: "0xAA", developerAddress: "0xBB" }, "0xaa"), "client");
assert.equal(roleFor({ clientAddress: "0xAA", developerAddress: "0xBB" }, "0xcc"), "other");
console.log("projectModel checks passed");
