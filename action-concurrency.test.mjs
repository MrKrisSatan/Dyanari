import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Core } from "./core.mjs";
test("computer mutations are serialised within and across app instances", async () => {
  const dir = fs.mkdtempSync(
      path.join(process.cwd(), ".dyanari-test-action-lock-"),
    ),
    a = new Core(dir),
    b = new Core(dir);
  a.save({
    tools: true,
    runTools: true,
    computer: true,
    computerMode: "autonomous",
    approvedApps: ["notepad"],
    approvedWorkflows: ["open_notepad"],
  });
  let finish;
  const release = new Promise((ok) => (finish = ok));
  a.actions.native = async () => {
    await release;
    return { launched: true };
  };
  b.actions.native = async () => ({ launched: true });
  const first = a.tool("open_application", { app: "notepad" });
  await new Promise((ok) => setImmediate(ok));
  await assert.rejects(
    a.tool("open_application", { app: "notepad" }),
    /action is active/,
  );
  await assert.rejects(
    b.tool("open_application", { app: "notepad" }),
    /using the desktop/,
  );
  finish();
  await first;
  assert.equal(
    (await b.tool("open_application", { app: "notepad" })).launched,
    true,
  );
  a.db.close();
  b.db.close();
});
