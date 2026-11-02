// Real local agent fixes a broken source file, then runs the offline check tool.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const dir = fs.mkdtempSync(
    path.join(process.cwd(), ".dyanari-test-project-checks-"),
  ),
  workspace = path.join(dir, "project"),
  port = 17845,
  base = `http://127.0.0.1:${port}`;
fs.mkdirSync(workspace);
const file = path.join(workspace, "sum.mjs");
fs.writeFileSync(file, "export function sum(a, b) {\n  return a + b;\n");
const child = spawn(process.execPath, ["--use-system-ca", "server.mjs"], {
  env: {
    ...process.env,
    DYANARI_DATA: path.join(dir, "data"),
    DYANARI_PORT: String(port),
  },
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
await new Promise((ok, no) => {
  child.stdout.once("data", ok);
  child.once("error", no);
  child.once("exit", () => no(Error("Server exited")));
});
try {
  const token = (await (await fetch(base)).text()).match(
      /name="token" content="([a-f0-9]+)"/,
    )[1],
    headers = { "Content-Type": "application/json", "X-Dyanari-Token": token };
  const call = async (route, body) => {
    const r = await fetch(base + "/api/" + route, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const v = await r.json();
    assert.ok(!v.error, v.error);
    return v;
  };
  await call("settings", {
    tools: true,
    runTools: true,
    read: true,
    edit: true,
    workspaces: [{ path: workspace, write: true }],
  });
  assert.equal(
    (
      await call("tool", {
        name: "check_project_file",
        arguments: { path: file },
      })
    ).passed,
    false,
  );
  const r = await fetch(base + "/api/chat", {
    method: "POST",
    headers,
    body: JSON.stringify({
      private: true,
      text: `Fix the syntax error in ${file}. Read it, use edit_file to fix it, then call check_project_file to verify valid syntax. Make the actual change and report the verified result.`,
    }),
    signal: AbortSignal.timeout(180000),
  });
  const stream = await r.text();
  assert.ok(!stream.includes('"error":'), stream);
  assert.ok(stream.includes('"tool":"edit_file"'), stream);
  assert.ok(stream.includes('"tool":"check_project_file"'), stream);
  assert.equal(
    (
      await call("tool", {
        name: "check_project_file",
        arguments: { path: file },
      })
    ).passed,
    true,
  );
  console.log(
    "PASS real local agent edited JavaScript and used the offline syntax-check tool successfully",
  );
} finally {
  child.kill();
}
