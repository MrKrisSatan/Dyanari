import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(path.join(root, "data"), { recursive: true });
const env = {
  ...process.env,
  OLLAMA_HOST: "127.0.0.1:11434",
  OLLAMA_MODELS: path.join(root, "data/models"),
  OLLAMA_NO_CLOUD: "1",
  OLLAMA_MAX_LOADED_MODELS: "1",
  OLLAMA_NUM_PARALLEL: "1",
};
try {
  await fetch("http://127.0.0.1:11434/api/version", {
    signal: AbortSignal.timeout(2000),
  });
} catch {
  const p = spawn(path.join(root, "runtime/ollama/ollama.exe"), ["serve"], {
    cwd: root,
    env,
    detached: true,
    windowsHide: true,
    stdio: [
      "ignore",
      fs.openSync(path.join(root, "data/ollama-out.log"), "a"),
      fs.openSync(path.join(root, "data/ollama-error.log"), "a"),
    ],
  });
  p.unref();
}
try {
  await fetch("http://127.0.0.1:17841/", { signal: AbortSignal.timeout(2000) });
} catch {
  const p = spawn(process.execPath, ["--use-system-ca", "server.mjs"], {
    cwd: root,
    detached: true,
    windowsHide: true,
    stdio: [
      "ignore",
      fs.openSync(path.join(root, "data/server-out.log"), "a"),
      fs.openSync(path.join(root, "data/server-error.log"), "a"),
    ],
  });
  p.unref();
}
console.log("Local services started. Open http://127.0.0.1:17841/");
