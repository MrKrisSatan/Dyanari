// Two real installed chat models; isolated SQLite data; no user memories changed.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const data = fs.mkdtempSync(
    path.join(process.cwd(), ".dyanari-test-memory-live-"),
  ),
  port = 17844,
  base = `http://127.0.0.1:${port}`;
let child, token;
async function start() {
  child = spawn(process.execPath, ["--use-system-ca", "server.mjs"], {
    env: { ...process.env, DYANARI_DATA: data, DYANARI_PORT: String(port) },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((ok, no) => {
    child.stdout.once("data", ok);
    child.once("error", no);
    child.once("exit", () => no(Error("Server exited before ready")));
  });
  token = (await (await fetch(base)).text()).match(
    /name="token" content="([a-f0-9]+)"/,
  )[1];
}
async function stop() {
  if (child && !child.killed) {
    const ended = new Promise((ok) => child.once("exit", ok));
    child.kill();
    await ended;
  }
}
async function api(route, body) {
  const r = await fetch(base + "/api/" + route, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "X-Dyanari-Token": token },
    body: body ? JSON.stringify(body) : undefined,
  });
  const v = await r.json();
  assert.ok(!v.error, JSON.stringify(v));
  return v;
}
async function ask(privateMode = false) {
  const r = await fetch(base + "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Dyanari-Token": token },
    body: JSON.stringify({
      text: "What is my workshop code? Reply with only the exact code.",
      private: privateMode,
    }),
    signal: AbortSignal.timeout(180000),
  });
  let output = "";
  for (const line of (await r.text()).split("\n").filter(Boolean)) {
    const v = JSON.parse(line);
    assert.ok(!v.error, v.error);
    output += v.token || "";
  }
  assert.match(output, /AMETHYST-7429/);
  return output.trim();
}
try {
  await start();
  await api("settings", {
    activeProject: "Workshop",
    model: "qwen3:4b-instruct",
    temperature: 0,
  });
  await api("memory", {
    content: "My workshop code is AMETHYST-7429",
    project: "Workshop",
  });
  console.log("PASS model A:", await ask());
  const before = await api("state");
  await api("settings", { model: "qwen3-vl:2b" });
  assert.equal(
    (await api("state")).memory.savedMemories,
    before.memory.savedMemories,
  );
  console.log("PASS model B with no conversation history:", await ask(true));
  assert.equal((await api("state")).messages.length, 2);
  console.log("PASS model B shared conversation:", await ask());
  assert.equal((await api("state")).messages.length, 4);
  await stop();
  await start();
  assert.equal((await api("state")).settings.model, "qwen3-vl:2b");
  console.log(
    "PASS after restart with no conversation history:",
    await ask(true),
  );
  assert.equal((await api("state")).memory.savedMemories, 1);
  assert.equal((await api("state")).messages.length, 4);
  console.log(
    "PASS shared memory and conversation survived two real models and backend restart",
  );
} finally {
  await stop();
}
