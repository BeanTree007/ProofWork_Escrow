// Run with: node src/lib/projectModel.check.mjs
import assert from "node:assert/strict";
import { validateProjectInput } from "./projectModel.js";

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
console.log("projectModel checks passed");
