// Real Windows Calculator workflow, using isolated app permissions and database.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { Core } from "./core.mjs";
const c = new Core(
  fs.mkdtempSync(path.join(process.cwd(), ".dyanari-test-actions-live-")),
);
try {
  c.save({
    tools: true,
    computer: true,
    runTools: true,
    computerMode: "assist",
    approvedApps: ["calculator"],
  });
  const existing = await c.actions.windows();
  if (
    existing.windows.length &&
    !process.argv.includes("--reuse-test-calculator")
  )
    throw Error(
      "Calculator is already open; close it before running this isolated acceptance test",
    );
  const pending = await c.tool("calculator_sum", { a: 17, b: 25 });
  assert.equal(pending.confirmation_required, true);
  const result = await c.actions.confirm(pending.id);
  assert.equal(result.verified, true);
  assert.equal(result.result, 42);
  console.log("PASS real Windows Calculator: " + JSON.stringify(result));
} finally {
  c.db.close();
}
