import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { setImmediate as yieldTask } from "node:timers/promises";

export const fileDefinitions = [
  [
    "search_files",
    "Recursively search approved workspace filenames (literal substring). Skips protected folders and links.",
    { path: "string", query: "string" },
  ],
  [
    "search_text",
    "Search literal text in approved text project files; returns bounded matching lines.",
    { path: "string", query: "string" },
  ],
  [
    "file_metadata",
    "Inspect an approved file or directory, including size and last modification time.",
    { path: "string" },
  ],
  [
    "compare_files",
    "Compare two approved text files and return changed line pairs.",
    { path: "string", other: "string" },
  ],
  [
    "create_directory",
    "Create one folder inside an approved writable workspace. Parent must exist.",
    { path: "string" },
  ],
  [
    "copy_file",
    "Copy an approved file to a new path. Never overwrites. Requires Read, Create and Organise.",
    { path: "string", destination: "string" },
  ],
  [
    "move_file",
    "Move or rename an approved file to a new path. Never overwrites. Requires Read and Organise.",
    { path: "string", destination: "string" },
  ],
  [
    "request_delete",
    "Request explicit user confirmation to move a file to recovery storage. Does not delete until the user confirms in Activity.",
    { path: "string" },
  ],
];
export class FileEngine {
  constructor(core) {
    this.core = core;
    this.pending = new Map();
    core.db.exec(
      `CREATE TABLE IF NOT EXISTS operations(id INTEGER PRIMARY KEY,kind TEXT,source TEXT,destination TEXT,digest TEXT,undone INTEGER DEFAULT 0,stamp TEXT DEFAULT CURRENT_TIMESTAMP);`,
    );
  }
  read() {
    if (!this.core.settings.tools) throw Error("Tools & File Access is OFF");
    if (!this.core.settings.read) throw Error("Read permission denied");
  }
  organise() {
    if (!this.core.settings.tools) throw Error("Tools & File Access is OFF");
    if (!this.core.settings.organise)
      throw Error("Organise Files permission denied");
  }
  regular(p) {
    const s = fs.lstatSync(p);
    if (!s.isFile() || s.isSymbolicLink()) throw Error("Regular files only");
    if (s.size > 100 * 1024 * 1024)
      throw Error("File exceeds 100MB operation limit");
    return s;
  }
  hash(p) {
    this.regular(p);
    return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  }
  record(kind, source, destination, digest) {
    const r = this.core.db
      .prepare(
        "INSERT INTO operations(kind,source,destination,digest) VALUES(?,?,?,?)",
      )
      .run(kind, source, destination, digest);
    return { operation: Number(r.lastInsertRowid), kind, source, destination };
  }
  async search(root, query, contents, signal) {
    this.read();
    if (typeof query !== "string" || !query.length || query.length > 200)
      throw Error("Search query must contain 1–200 characters");
    const resolved = this.core.resolve(root);
    if (fs.statSync(resolved).isFile()) {
      if (signal?.aborted) throw Error("Cancelled");
      const results = contents
        ? this.core
            .text(resolved)
            .split(/\r?\n/)
            .flatMap((line, i) =>
              line.toLowerCase().includes(query.toLowerCase())
                ? [{ path: resolved, line: i + 1, text: line.slice(0, 500) }]
                : [],
            )
        : path.basename(resolved).toLowerCase().includes(query.toLowerCase())
          ? [{ path: resolved }]
          : [];
      return {
        results: results.slice(0, 100),
        scanned: 1,
        truncated: results.length > 100,
      };
    }
    const queue = [resolved],
      results = [];
    let scanned = 0;
    while (queue.length && scanned < 3000 && results.length < 100) {
      if (signal?.aborted) throw Error("Cancelled");
      this.read();
      const dir = queue.shift();
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (++scanned > 3000) break;
        const p = path.join(dir, entry.name);
        if (entry.isSymbolicLink()) continue;
        try {
          this.core.resolve(p);
        } catch {
          continue;
        }
        if (entry.isDirectory()) {
          queue.push(p);
          continue;
        }
        if (!contents) {
          if (entry.name.toLowerCase().includes(query.toLowerCase()))
            results.push({ path: p });
        } else {
          let text;
          try {
            text = this.core.text(p);
          } catch {
            continue;
          }
          for (const [i, line] of text.split(/\r?\n/).entries()) {
            if (line.toLowerCase().includes(query.toLowerCase()))
              results.push({ path: p, line: i + 1, text: line.slice(0, 500) });
            if (results.length >= 100) break;
          }
        }
        if (results.length >= 100) break;
      }
      await yieldTask();
    }
    return {
      results,
      scanned,
      truncated: queue.length > 0 || scanned >= 3000 || results.length >= 100,
    };
  }
  async execute(name, a, signal) {
    const c = this.core;
    switch (name) {
      case "search_files":
        return this.search(a.path, a.query, false, signal);
      case "search_text":
        return this.search(a.path, a.query, true, signal);
      case "file_metadata": {
        this.read();
        const p = c.resolve(a.path),
          s = fs.statSync(p);
        return {
          path: p,
          directory: s.isDirectory(),
          bytes: s.size,
          modified: s.mtime.toISOString(),
          created: s.birthtime.toISOString(),
          ...(s.isFile() && s.size <= 100 * 1024 * 1024
            ? { sha256: this.hash(p) }
            : {}),
        };
      }
      case "compare_files": {
        this.read();
        const first = c.text(c.resolve(a.path)).split(/\r?\n/),
          second = c.text(c.resolve(a.other)).split(/\r?\n/),
          changes = [];
        for (
          let i = 0;
          i < Math.max(first.length, second.length) && changes.length < 100;
          i++
        )
          if (first[i] !== second[i])
            changes.push({
              line: i + 1,
              before: first[i] ?? null,
              after: second[i] ?? null,
            });
        return {
          equal: changes.length === 0,
          changes,
          truncated: changes.length === 100,
        };
      }
      case "create_directory": {
        if (!c.settings.create) throw Error("Create Files permission denied");
        const p = c.resolve(a.path, true, true);
        fs.mkdirSync(p);
        return this.record("mkdir", p, "", "");
      }
      case "copy_file":
      case "move_file": {
        this.read();
        this.organise();
        if (name === "copy_file" && !c.settings.create)
          throw Error("Create Files permission denied");
        const source = c.resolve(a.path, name === "move_file"),
          destination = c.resolve(a.destination, true, true);
        this.regular(source);
        if (fs.existsSync(destination))
          throw Error("Destination already exists");
        const digest = this.hash(source);
        fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
        if (this.hash(destination) !== digest)
          throw Error("Copied file verification failed");
        if (name === "move_file") {
          if (this.hash(source) !== digest)
            throw Error("Source changed during move; copy retained");
          fs.unlinkSync(source);
        }
        return this.record(
          name === "move_file" ? "move" : "copy",
          source,
          destination,
          digest,
        );
      }
      case "request_delete": {
        this.read();
        this.organise();
        const p = c.resolve(a.path, true),
          digest = this.hash(p),
          id = crypto.randomUUID();
        this.pending.set(id, {
          id,
          path: p,
          digest,
          expires: Date.now() + 5 * 60 * 1000,
        });
        return {
          confirmation_required: true,
          id,
          path: p,
          message:
            "No deletion performed. Confirm this specific file in Activity within five minutes.",
        };
      }
      default:
        throw Error("Unknown file operation");
    }
  }
  confirm(id) {
    const item = this.pending.get(id);
    if (!item || Date.now() > item.expires) throw Error("Confirmation expired");
    this.read();
    this.organise();
    const source = this.core.resolve(item.path, true);
    if (this.hash(source) !== item.digest)
      throw Error("File changed; request confirmation again");
    const trash = path.join(this.core.dir, "recovery");
    fs.mkdirSync(trash, { recursive: true });
    const destination = path.join(trash, crypto.randomUUID());
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    if (
      this.hash(destination) !== item.digest ||
      this.hash(source) !== item.digest
    )
      throw Error("Recovery copy verification failed");
    fs.unlinkSync(source);
    this.pending.delete(id);
    return this.record("trash", source, destination, item.digest);
  }
  undo(id) {
    this.organise();
    const op = this.core.db
      .prepare("SELECT * FROM operations WHERE id=? AND undone=0")
      .get(Number(id));
    if (!op) throw Error("Operation not found or already undone");
    if (op.kind === "mkdir") {
      const p = this.core.resolve(op.source, true);
      if (fs.readdirSync(p).length) throw Error("Folder is no longer empty");
      fs.rmdirSync(p);
    } else if (op.kind === "copy") {
      const p = this.core.resolve(op.destination, true);
      if (this.hash(p) !== op.digest)
        throw Error("Copied file changed; undo blocked");
      fs.unlinkSync(p);
    } else {
      const source =
          op.kind === "trash"
            ? op.destination
            : this.core.resolve(op.destination, true),
        destination = this.core.resolve(op.source, true, true);
      if (
        op.kind === "trash" &&
        !this.core.inside(path.join(this.core.dir, "recovery"), source)
      )
        throw Error("Invalid recovery path");
      if (this.hash(source) !== op.digest)
        throw Error("File changed; undo blocked");
      fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
      if (this.hash(destination) !== op.digest)
        throw Error("Restore verification failed");
      fs.unlinkSync(source);
    }
    this.core.db
      .prepare("UPDATE operations SET undone=1 WHERE id=?")
      .run(op.id);
    this.core.log("recovery", "Undid operation " + op.id);
    return { undone: op.id };
  }
  history() {
    return this.core.db
      .prepare(
        "SELECT id,kind,source,destination,undone,stamp FROM operations ORDER BY id DESC LIMIT 80",
      )
      .all();
  }
}
