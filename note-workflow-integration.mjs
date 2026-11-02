// Creates only a disposable test note, opens it in real Notepad, then reads it.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { Core } from "./core.mjs";
const dir = fs.mkdtempSync(
    path.join(process.cwd(), ".dyanari-test-note-live-"),
  ),
  workspace = path.join(dir, "project");
fs.mkdirSync(workspace);
const c = new Core(path.join(dir, "data"));
try {
  c.save({
    tools: true,
    runTools: true,
    computer: true,
    computerMode: "assist",
    approvedApps: ["notepad"],
    create: true,
    workspaces: [{ path: workspace, write: true }],
  });
  const existing = (await c.actions.windows()).windows;
  if (
    existing.length &&
    (!process.argv.includes("--reuse-test-notepad") ||
      existing.some((w) => !w.title.startsWith("Dyanari-test-note")))
  )
    throw Error(
      "Unrelated Notepad windows must be closed before this isolated test",
    );
  const name = "Dyanari-test-note-" + path.basename(dir).slice(-6),
    file = path.join(workspace, name + ".txt"),
    content =
      "Dyanari verified workspace note " +
      name +
      "\r\nCreated through an approved local workflow.\r\n";
  const pending = await c.tool("create_workspace_note", {
    path: file,
    content,
  });
  assert.equal(pending.confirmation_required, true);
  assert.equal(fs.existsSync(file), false);
  const result = await c.actions.confirm(pending.id);
  assert.equal(fs.readFileSync(file, "utf8"), content);
  assert.equal(result.launched, true, JSON.stringify(result));
  const window = result.windows.find((w) => w.title.includes(name));
  assert.ok(window, JSON.stringify(result));
  await c.actions.grant(window.id);
  const inspected = await c.tool("inspect_window", { window: window.id });
  assert.ok(
    inspected.controls.some((control) =>
      String(control.value || "").includes(name),
    ),
    JSON.stringify(inspected),
  );
  console.log(
    "PASS real Notepad: approved note created, opened and its text read through UI Automation",
  );
  console.log(JSON.stringify({ window: window.id, file }));
} finally {
  c.db.close();
}
