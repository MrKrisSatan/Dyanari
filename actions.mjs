import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ResourceManager } from "./resources.mjs";
const source = path.dirname(fileURLToPath(import.meta.url));
export const supportedApps = ["notepad", "calculator"];
export const supportedWorkflows = [
  "open_notepad",
  "open_calculator",
  "create_workspace_note",
  "calculator_sum",
];
export const actionDefinitions = [
  [
    "calculator_sum",
    "Add two non-negative integers up to 9999 in the real Windows Calculator and verify its display. Replaces the current Calculator display. Observe blocks it; Assist requires approval; Autonomous requires its standing workflow approval.",
    { a: "number", b: "number" },
  ],
  [
    "list_windows",
    "List visible supported application windows permitted by Computer Control. Does not grant access to their contents.",
    {},
  ],
  [
    "inspect_window",
    "Read controls in a window the user has explicitly authorised for this session.",
    { window: "string" },
  ],
  [
    "open_application",
    "Request opening an approved application: notepad or calculator. Observe blocks it; Assist requires user confirmation.",
    { app: "string" },
  ],
  [
    "set_control_text",
    "Request a text replacement in an authorised window. Use the control id and SHA-256 from inspect_window. Always requires a fresh user confirmation.",
    {
      window: "string",
      control: "string",
      text: "string",
      expected_sha256: "string",
    },
  ],
  [
    "invoke_control",
    "Request invoking a specific button/menu item from inspect_window. Always requires a fresh user confirmation.",
    { window: "string", control: "string" },
  ],
  [
    "create_workspace_note",
    "Create a NEW .txt note in an approved writable workspace and open it in Notepad. Observe blocks it; Autonomous requires standing approval for this exact workflow.",
    { path: "string", content: "string" },
  ],
  [
    "check_project_file",
    "Run an offline, non-executing syntax check on an approved JS/MJS/CJS, JSON or Python source file. Requires Run Tools and Read Files.",
    { path: "string" },
  ],
];
export function runChild(
  file,
  args,
  { input = "", signal, timeout = 15000, cwd } = {},
) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Error("Cancelled"));
    const env = { ...process.env };
    for (const key of [
      "NODE_OPTIONS",
      "NODE_PATH",
      "PYTHONPATH",
      "PYTHONSTARTUP",
    ])
      delete env[key];
    const child = spawn(file, args, {
      cwd,
      env,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "",
      limit = false,
      timedOut = false,
      finished = false;
    let exitDrain;
    const abort = () => {
      child.kill();
      end(Error("Cancelled"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      end(Error("Tool timed out"));
    }, timeout);
    function end(error, value) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearTimeout(exitDrain);
      signal?.removeEventListener("abort", abort);
      child.stdin.destroy();
      child.stdout.destroy();
      child.stderr.destroy();
      if (error) reject(error);
      else resolve(value);
    }
    child.on("error", (e) => end(e));
    for (const [stream, key] of [
      [child.stdout, "stdout"],
      [child.stderr, "stderr"],
    ])
      stream.setEncoding("utf8").on("data", (b) => {
        if (key === "stdout") stdout += b;
        else stderr += b;
        if (stdout.length + stderr.length > 128000) {
          limit = true;
          child.kill();
          end(Error("Tool output limit exceeded"));
        }
      });
    const finishCode = (code) => {
      if (signal?.aborted) return end(Error("Cancelled"));
      if (timedOut) return end(Error("Tool timed out"));
      if (limit) return end(Error("Tool output limit exceeded"));
      end(null, {
        code,
        stdout: stdout.slice(0, 64000),
        stderr: stderr.slice(0, 64000),
      });
    };
    child.on("close", finishCode);
    // A launched GUI descendant may inherit a pipe after the helper exits.
    child.on("exit", (code) => {
      exitDrain = setTimeout(() => finishCode(code), 100);
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}
export class ActionEngine {
  constructor(core) {
    this.core = core;
    this.grants = new Map();
    this.pending = new Map();
    this.running = false;
    this.resources = new ResourceManager(
      core.dir,
      "desktop-task.lock",
      "desktop",
    );
    const embedded = path.join(source, "Dyanari.Actions.exe");
    this.helper = fs.existsSync(embedded)
      ? embedded
      : path.join(
          process.env.DYANARI_HOME || source,
          "runtime/actions/Dyanari.Actions.exe",
        );
  }
  state() {
    return {
      available: fs.existsSync(this.helper),
      grants: [...this.grants.values()],
      pending: [...this.pending.values()]
        .filter((p) => p.expires > Date.now())
        .map(({ args, ...p }) => p),
      supportedApps,
      supportedWorkflows,
    };
  }
  gate(write = false) {
    const s = this.core.settings;
    if (!s.tools) throw Error("Tools & File Access is OFF");
    if (!s.computer) throw Error("Computer Control is OFF");
    if (write && s.computerMode === "observe")
      throw Error("Observe mode blocks computer actions");
    return s;
  }
  async native(request, signal) {
    if (!fs.existsSync(this.helper))
      throw Error("Native action helper is not installed");
    const result = await runChild(this.helper, [], {
      input: JSON.stringify(request),
      signal,
      timeout: 15000,
    });
    let value;
    try {
      value = JSON.parse(result.stdout);
    } catch {
      throw Error("Action helper failed: " + result.stderr.slice(0, 1000));
    }
    if (value.error || result.code !== 0)
      throw Error(value.error || "Action helper failed");
    return value;
  }
  async windows(signal) {
    const s = this.gate(),
      v = await this.native({ operation: "list" }, signal);
    return {
      windows: v.windows
        .filter((w) => s.approvedApps.includes(w.app))
        .map((w) => ({ ...w, authorised: this.grants.has(w.id) })),
    };
  }
  async grant(id, signal) {
    const { windows } = await this.windows(signal),
      window = windows.find((w) => w.id === id);
    if (!window)
      throw Error(
        "Window is not currently visible or its application is not approved",
      );
    this.grants.set(id, { ...window, granted: new Date().toISOString() });
    this.core.log("computer", "Authorised window " + id + " " + window.title);
    return { authorised: id };
  }
  revoke(id) {
    this.grants.delete(id);
    for (const [key, p] of this.pending)
      if (p.args.window === id) this.pending.delete(key);
    this.core.log("computer", "Revoked window " + id);
    return { revoked: id };
  }
  window(id) {
    const s = this.gate(),
      grant = this.grants.get(id);
    if (!grant || !s.approvedApps.includes(grant.app))
      throw Error("User must authorise this specific window in Tools first");
    return grant;
  }
  async inspect(id, signal) {
    this.window(id);
    return this.native({ operation: "inspect", window: id }, signal);
  }
  app(app) {
    const s = this.gate(true);
    if (!s.runTools)
      throw Error("Run Tools permission is OFF for application launches");
    if (!supportedApps.includes(app) || !s.approvedApps.includes(app))
      throw Error("Application is not approved");
    return s;
  }
  async prepare(name, a, signal) {
    this.gate(true);
    if (name === "calculator_sum") {
      this.app("calculator");
      for (const k of ["a", "b"])
        if (!Number.isInteger(a[k]) || a[k] < 0 || a[k] > 9999)
          throw Error("Calculator inputs must be integers from 0 to 9999");
      return {
        summary:
          "Calculate " +
          a.a +
          " + " +
          a.b +
          " in Windows Calculator (replaces its current display).",
        workflow: "calculator_sum",
      };
    }
    if (name === "open_application") {
      this.app(a.app);
      return { summary: "Open " + a.app, workflow: "open_" + a.app };
    }
    if (name === "create_workspace_note") {
      this.app("notepad");
      if (!this.core.settings.create)
        throw Error("Create Files permission denied");
      if (
        typeof a.content !== "string" ||
        a.content.length > 12000 ||
        !a.path?.toLowerCase().endsWith(".txt")
      )
        throw Error(
          "Notes must be .txt files containing at most 12000 characters",
        );
      const target = this.core.resolve(a.path, true, true);
      if (fs.existsSync(target))
        throw Error("Note path already exists; choose a new file");
      return {
        summary: "Create and open " + target + "\n\n" + a.content,
        workflow: "create_workspace_note",
      };
    }
    this.window(a.window);
    const current = await this.inspect(a.window, signal),
      control = current.controls.find((c) => c.id === a.control);
    if (!control) throw Error("Control is no longer present; inspect again");
    if (name === "set_control_text") {
      if (!control.editable || !control.sha256)
        throw Error("Control does not support verified text replacement");
      if (control.sha256 !== a.expected_sha256)
        throw Error("Control text changed; inspect again");
      if (typeof a.text !== "string" || a.text.length > 12000)
        throw Error("Text must contain at most 12000 characters");
      return {
        guard: this.core.hash(JSON.stringify(current.controls)),
        summary:
          "Replace text in " +
          control.name +
          "\nWindow: " +
          this.grants.get(a.window).title +
          "\nBefore: " +
          (control.value || "") +
          "\nAfter: " +
          a.text,
      };
    }
    if (name === "invoke_control") {
      if (!control.invokable) throw Error("Control does not support Invoke");
      return {
        guard: this.core.hash(JSON.stringify(current.controls)),
        summary:
          "Invoke " +
          control.role +
          " “" +
          control.name +
          "” in " +
          this.grants.get(a.window).title,
      };
    }
    throw Error("Unknown computer action");
  }
  async request(name, a, signal) {
    const prepared = await this.prepare(name, a, signal),
      s = this.core.settings;
    if (
      s.computerMode === "autonomous" &&
      prepared.workflow &&
      s.approvedWorkflows.includes(prepared.workflow)
    )
      return this.perform(name, a, signal);
    const id = crypto.randomUUID();
    this.pending.set(id, {
      id,
      name,
      args: structuredClone(a),
      summary: prepared.summary,
      guard: prepared.guard,
      expires: Date.now() + 300000,
    });
    this.core.log(
      "approval",
      "Computer action awaiting user: " + prepared.summary,
    );
    return {
      confirmation_required: true,
      id,
      summary: prepared.summary,
      message:
        "No action executed. Approve this specific action in Computer & checks within five minutes.",
    };
  }
  async confirm(id, signal) {
    const p = this.pending.get(id);
    if (!p || p.expires < Date.now()) throw Error("Approval expired");
    this.pending.delete(id);
    return this.perform(p.name, p.args, signal, p.guard);
  }
  async perform(name, a, signal, expectedGuard) {
    if (this.running) throw Error("Another computer action is active");
    const release = this.resources.acquire(name);
    this.running = true;
    try {
      const prepared = await this.prepare(name, a, signal);
      if (expectedGuard && prepared.guard !== expectedGuard)
        throw Error(
          "Window changed after the preview; inspect and request approval again",
        );
      if (signal?.aborted) throw Error("Cancelled");
      this.core.log("computer", "Executing " + name);
      let result;
      if (name === "calculator_sum")
        result = await this.native(
          { operation: "sum", a: a.a, b: a.b },
          signal,
        );
      else if (name === "open_application")
        result = await this.native({ operation: "launch", app: a.app }, signal);
      else if (name === "create_workspace_note") {
        const file = this.core.write(a.path, a.content);
        try {
          result = {
            file,
            ...(await this.native(
              { operation: "launch", app: "notepad", file: file.path },
              signal,
            )),
          };
        } catch (e) {
          result = { file, opened: false, error: e.message };
        }
      } else
        result = await this.native(
          {
            operation: name === "set_control_text" ? "set_text" : "invoke",
            window: a.window,
            control: a.control,
            text: a.text,
            expected_sha256: a.expected_sha256,
          },
          signal,
        );
      this.core.log("computer", "Result " + JSON.stringify(result));
      return result;
    } finally {
      this.running = false;
      release();
    }
  }
  async checkFile(file, signal) {
    const s = this.core.settings;
    if (!s.tools || !s.runTools) throw Error("Run Tools permission is OFF");
    if (!s.read) throw Error("Read Files permission denied");
    const p = this.core.resolve(file),
      text = this.core.text(p),
      ext = path.extname(p).toLowerCase();
    let executable = process.execPath,
      args,
      input = text;
    if (ext === ".json")
      args = [
        "--input-type=commonjs",
        "-e",
        "let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',b=>s+=b);process.stdin.on('end',()=>{try{JSON.parse(s);console.log('Valid JSON')}catch(e){console.error(e.message);process.exitCode=1}})",
      ];
    else if ([".js", ".mjs", ".cjs"].includes(ext)) {
      let module = ext === ".mjs";
      if (ext === ".js") {
        let dir = path.dirname(p);
        const workspace = s.workspaces.find((w) => this.core.inside(w.path, p));
        while (workspace && this.core.inside(workspace.path, dir)) {
          const pkg = path.join(dir, "package.json");
          if (fs.existsSync(pkg)) {
            try {
              module =
                JSON.parse(this.core.text(this.core.resolve(pkg))).type ===
                "module";
            } catch {}
            break;
          }
          const parent = path.dirname(dir);
          if (parent === dir) break;
          dir = parent;
        }
      }
      args = ["--check", "--input-type=" + (module ? "module" : "commonjs")];
    } else if (ext === ".py") {
      executable = path.join(
        process.env.DYANARI_HOME || source,
        "runtime/comfy-env/Scripts/python.exe",
      );
      if (!fs.existsSync(executable))
        throw Error("Local Python interpreter is not configured");
      args = [
        "-I",
        "-X",
        "utf8",
        "-S",
        "-c",
        'import ast,sys; ast.parse(sys.stdin.read()); print("Valid Python syntax")',
      ];
    } else throw Error("Syntax checks support JS/MJS/CJS, JSON and Python");
    this.core.log("validation", "Checking " + p);
    const result = await runChild(executable, args, {
      input,
      signal,
      timeout: 10000,
    });
    const response = {
      path: p,
      sha256: this.core.hash(text),
      passed: result.code === 0,
      exitCode: result.code,
      output:
        (result.stdout + "\n" + result.stderr).trim() ||
        (result.code === 0 ? "Syntax valid" : "Syntax check failed"),
      executedSource: false,
    };
    this.core.log("validation", JSON.stringify(response));
    return response;
  }
  async execute(name, a, signal) {
    if (name === "list_windows") return this.windows(signal);
    if (name === "inspect_window") return this.inspect(a.window, signal);
    if (name === "check_project_file") return this.checkFile(a.path, signal);
    return this.request(name, a, signal);
  }
  cancel() {
    this.pending.clear();
  }
}
