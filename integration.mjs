// Runs against an isolated app instance. Uses real local inference and public HTTPS.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const data = fs.mkdtempSync(path.join(process.cwd(), ".dyanari-test-http-")),
  port = 17842,
  base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["--use-system-ca", "server.mjs"], {
  env: {
    ...process.env,
    DYANARI_DATA: path.join(data, "data"),
    DYANARI_PORT: String(port),
  },
  stdio: "pipe",
  windowsHide: true,
});
await new Promise((ok, no) => {
  child.stdout.once("data", ok);
  child.once("error", no);
  child.once("exit", () => no(Error("Server exited")));
});
try {
  const html = await (await fetch(base)).text(),
    token = html.match(/name="token" content="([a-f0-9]+)"/)[1];
  const call = async (route, body) => {
    const r = await fetch(base + "/api/" + route, {
      method: body ? "POST" : "GET",
      headers: { "X-Dyanari-Token": token, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return r.json();
  };
  assert.equal((await fetch(base + "/api/state")).status, 403);
  assert.equal(
    (
      await fetch(base + "/api/state", {
        headers: { "X-Dyanari-Token": token, Origin: "https://example.com" },
      })
    ).status,
    403,
  );
  const project = path.join(data, "project");
  fs.mkdirSync(project);
  const file = path.join(project, "sample.txt");
  fs.writeFileSync(file, "The answer is forty one.");
  assert.match(
    (await call("tool", { name: "read_file", arguments: { path: file } }))
      .error,
    /OFF/,
  );
  assert.match(
    (
      await call("tool", {
        name: "fetch_page",
        arguments: { url: "https://example.com" },
      })
    ).error,
    /OFF/,
  );
  await call("settings", {
    internet: true,
    tools: true,
    read: true,
    edit: true,
    workspaces: [{ path: project, write: true }],
  });
  const page = await call("tool", {
    name: "fetch_page",
    arguments: { url: "https://example.com" },
  });
  assert.match(page.text, /Example Domain/);
  const r = await fetch(base + "/api/chat", {
    method: "POST",
    headers: { "X-Dyanari-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `Use read_file then edit_file to replace "forty one" with "forty two" in ${file}. Preserve the rest. Verify the saved result with read_file.`,
      private: true,
    }),
  });
  const stream = await r.text();
  assert.ok(!stream.includes('"error":'), stream);
  assert.match(fs.readFileSync(file, "utf8"), /forty two/);
  assert.ok(stream.includes('"tool":"edit_file"'));
  console.log("PASS real Qwen3 tool loop edited and verified file");
  assert.equal((await call("state")).messages.length, 0);
  console.log("PASS private chat not stored");
  await call("memory", {
    content: "Integration memory survives storage",
    project: "test",
  });
  const backup = await call("backup", { password: "dyanari-test-password" });
  assert.ok(
    backup.data && !JSON.stringify(backup).includes("Integration memory"),
  );
  assert.equal(
    (await call("restore", { password: "dyanari-test-password", backup }))
      .restored,
    true,
  );
  assert.equal((await call("state")).settings.internet, false);
  console.log("PASS encrypted backup and restore; permissions reset");
  console.log(
    "PASS authentication, origin enforcement, OFF denial, live HTTPS, real model file editing",
  );
} finally {
  child.kill();
}
