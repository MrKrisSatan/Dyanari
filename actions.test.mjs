import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Core } from "./core.mjs";
import { runChild } from "./actions.mjs";
test("a completed helper does not wait on output pipes inherited by a descendant", async () => {
  const start = Date.now();
  const result = await runChild(
    process.execPath,
    [
      "-e",
      "const {spawn}=require('node:child_process');spawn(process.execPath,['-e','setTimeout(()=>{},2000)'],{stdio:'inherit',windowsHide:true}).unref();console.log('helper complete')",
    ],
    { timeout: 1500 },
  );
  assert.equal(result.code, 0);
  assert.match(result.stdout, /helper complete/);
  assert.ok(Date.now() - start < 1500);
});
function setup() {
  const dir = fs.mkdtempSync(
      path.join(process.cwd(), ".dyanari-test-actions-"),
    ),
    workspace = path.join(dir, "project");
  fs.mkdirSync(workspace);
  const c = new Core(path.join(dir, "data"));
  let calls = [],
    value = "original";
  const window = {
    id: "100:200:300",
    app: "notepad",
    title: "Test note",
    pid: 200,
  };
  c.actions.native = async (request) => {
    calls.push(request);
    if (request.operation === "list") return { windows: [window] };
    if (request.operation === "inspect")
      return {
        controls: [
          {
            id: "edit",
            name: "Note text",
            role: "ControlType.Edit",
            value,
            sha256: c.hash(value),
            editable: true,
            invokable: false,
          },
          {
            id: "button",
            name: "Apply",
            role: "ControlType.Button",
            invokable: true,
          },
        ],
      };
    if (request.operation === "set_text") {
      value = request.text;
      return { changed: true };
    }
    return { launched: true, invoked: true, verified: true, result: 42 };
  };
  return { c, workspace, calls, window, change: (v) => (value = v) };
}
test("computer access defaults OFF and Observe cannot mutate", async () => {
  const { c } = setup();
  await assert.rejects(c.tool("list_windows", {}), /OFF/);
  c.save({
    tools: true,
    computer: true,
    runTools: true,
    approvedApps: ["notepad"],
  });
  assert.equal((await c.tool("list_windows", {})).windows.length, 1);
  await assert.rejects(
    c.tool("open_application", { app: "notepad" }),
    /Observe/,
  );
  c.db.close();
});
test("window authorisation is explicit, per-session and cannot be bypassed by a model argument", async () => {
  const { c, window } = setup();
  c.save({
    tools: true,
    computer: true,
    runTools: true,
    computerMode: "assist",
    approvedApps: ["notepad"],
  });
  await assert.rejects(
    c.tool("inspect_window", { window: window.id, approved: true }),
    /authorise/,
  );
  await c.actions.grant(window.id);
  assert.equal(
    (await c.tool("inspect_window", { window: window.id })).controls.length,
    2,
  );
  const other = new Core(c.dir);
  assert.equal(other.actions.grants.size, 0);
  other.db.close();
  c.actions.revoke(window.id);
  await assert.rejects(
    c.tool("inspect_window", { window: window.id }),
    /authorise/,
  );
  c.db.close();
});
test("Assist requests do not execute until a user confirmation and approvals are single use", async () => {
  const { c, calls } = setup();
  c.save({
    tools: true,
    computer: true,
    runTools: true,
    computerMode: "assist",
    approvedApps: ["notepad"],
  });
  const request = await c.tool("open_application", {
    app: "notepad",
    approved: true,
  });
  assert.equal(request.confirmation_required, true);
  assert.equal(calls.length, 0);
  await assert.rejects(c.tool("confirm_action", { id: request.id }), /Unknown/);
  await c.actions.confirm(request.id);
  assert.equal(calls.at(-1).operation, "launch");
  await assert.rejects(c.actions.confirm(request.id), /expired/);
  c.db.close();
});
test("Autonomous only executes explicitly approved workflows; generic UI changes still wait", async () => {
  const { c, calls, window } = setup();
  c.save({
    tools: true,
    computer: true,
    runTools: true,
    computerMode: "autonomous",
    approvedApps: ["notepad"],
  });
  const pending = await c.tool("open_application", { app: "notepad" });
  assert.equal(pending.confirmation_required, true);
  c.save({ approvedWorkflows: ["open_notepad"] });
  assert.equal(
    (await c.tool("open_application", { app: "notepad" })).launched,
    true,
  );
  await c.actions.grant(window.id);
  const edit = await c.tool("set_control_text", {
    window: window.id,
    control: "edit",
    text: "new",
    expected_sha256: c.hash("original"),
  });
  assert.equal(edit.confirmation_required, true);
  assert.ok(!calls.some((r) => r.operation === "set_text"));
  c.db.close();
});
test("approval refuses stale text and changed window previews", async () => {
  const { c, window, change } = setup();
  c.save({
    tools: true,
    computer: true,
    runTools: true,
    computerMode: "assist",
    approvedApps: ["notepad"],
  });
  await c.actions.grant(window.id);
  const edit = await c.tool("set_control_text", {
    window: window.id,
    control: "edit",
    text: "new",
    expected_sha256: c.hash("original"),
  });
  change("external edit");
  await assert.rejects(c.actions.confirm(edit.id), /changed/);
  const invoke = await c.tool("invoke_control", {
    window: window.id,
    control: "button",
  });
  change("another edit");
  await assert.rejects(
    c.actions.confirm(invoke.id),
    /changed after the preview/,
  );
  c.db.close();
});
test("revocation and cancellation invalidate pending requests", async () => {
  const { c } = setup();
  c.save({
    tools: true,
    computer: true,
    runTools: true,
    computerMode: "assist",
    approvedApps: ["notepad"],
  });
  const pending = await c.tool("open_application", { app: "notepad" });
  c.save({ computer: false });
  await assert.rejects(c.actions.confirm(pending.id), /expired|OFF/);
  c.save({ computer: true });
  const next = await c.tool("open_application", { app: "notepad" });
  c.actions.cancel();
  await assert.rejects(c.actions.confirm(next.id), /expired/);
  c.db.close();
});
test("workspace note workflow checks create permission, scope and overwriting", async () => {
  const { c, workspace } = setup();
  c.save({
    tools: true,
    computer: true,
    runTools: true,
    computerMode: "autonomous",
    approvedApps: ["notepad"],
    approvedWorkflows: ["create_workspace_note"],
    workspaces: [{ path: workspace, write: true }],
  });
  const file = path.join(workspace, "note.txt");
  await assert.rejects(
    c.tool("create_workspace_note", { path: file, content: "note" }),
    /Create/,
  );
  c.save({ create: true });
  const result = await c.tool("create_workspace_note", {
    path: file,
    content: "note",
  });
  assert.equal(fs.readFileSync(file, "utf8"), "note");
  assert.equal(result.launched, true);
  await assert.rejects(
    c.tool("create_workspace_note", { path: file, content: "overwrite" }),
    /exists/,
  );
  c.db.close();
});
test("offline JS/JSON syntax validation never executes source", async () => {
  const { c, workspace } = setup(),
    marker = path.join(workspace, "must-not-exist.txt"),
    script = path.join(workspace, "check.cjs"),
    json = path.join(workspace, "data.json");
  fs.writeFileSync(
    script,
    "require('node:fs').writeFileSync(" +
      JSON.stringify(marker) +
      ", 'executed')",
  );
  fs.writeFileSync(json, '{"valid":true}');
  c.save({
    tools: true,
    runTools: true,
    read: true,
    internet: false,
    workspaces: [{ path: workspace, write: false }],
  });
  assert.equal(
    (await c.tool("check_project_file", { path: script })).passed,
    true,
  );
  assert.equal(fs.existsSync(marker), false);
  assert.equal(
    (await c.tool("check_project_file", { path: json })).passed,
    true,
  );
  fs.writeFileSync(script, "function broken(");
  assert.equal(
    (await c.tool("check_project_file", { path: script })).passed,
    false,
  );
  fs.writeFileSync(json, '{"broken":');
  assert.equal(
    (await c.tool("check_project_file", { path: json })).passed,
    false,
  );
  c.save({ runTools: false });
  await assert.rejects(c.tool("check_project_file", { path: script }), /OFF/);
  c.db.close();
});
test("tool subprocesses enforce cancellation and timeouts", async () => {
  const controller = new AbortController(),
    pending = runChild(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
      signal: controller.signal,
    });
  controller.abort();
  await assert.rejects(pending, /Cancelled/);
  await assert.rejects(
    runChild(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
      timeout: 50,
    }),
    /timed out/,
  );
});
