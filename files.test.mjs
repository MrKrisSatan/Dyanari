import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Core } from "./core.mjs";
test("text and filename search accept an authorised file as well as a directory", async () => {
  const { c, ws } = setup();
  const file = path.join(ws, "single.txt");
  fs.writeFileSync(file, "first match\nsecond match\n");
  const result = await c.tool("search_text", { path: file, query: "match" });
  assert.equal(result.results.length, 2);
  assert.equal(result.scanned, 1);
  assert.equal(
    (await c.tool("search_files", { path: file, query: "single" })).results[0]
      .path,
    file,
  );
  c.db.close();
});
test("permission revocation reaches another Core sharing the same database", async () => {
  const { c, ws, dir } = setup();
  const a = path.join(ws, "a.txt");
  fs.writeFileSync(a, "data");
  const other = new Core(path.join(dir, "data"));
  assert.equal((await other.tool("read_file", { path: a })).text, "data");
  const task = new AbortController();
  other.controllers.add(task);
  c.save({ tools: false });
  await assert.rejects(other.tool("read_file", { path: a }), /OFF/);
  assert.equal(task.signal.aborted, true);
  other.db.close();
  c.db.close();
});
function setup() {
  const dir = fs.mkdtempSync(path.join(process.cwd(), ".dyanari-test-files-"));
  const ws = path.join(dir, "project");
  fs.mkdirSync(ws);
  const c = new Core(path.join(dir, "data"));
  c.save({
    tools: true,
    read: true,
    create: true,
    edit: true,
    organise: true,
    workspaces: [{ path: ws, write: true }],
  });
  return { c, ws, dir };
}
test("search finds nested source and skips protected folders", async () => {
  const { c, ws } = setup();
  fs.mkdirSync(path.join(ws, "src"));
  fs.mkdirSync(path.join(ws, ".git"));
  fs.writeFileSync(path.join(ws, "src", "game.py"), "harvester_count = 1\n");
  fs.writeFileSync(path.join(ws, ".git", "private.txt"), "harvester secret");
  const names = await c.tool("search_files", { path: ws, query: ".py" });
  assert.equal(names.results.length, 1);
  const text = await c.tool("search_text", { path: ws, query: "harvester" });
  assert.equal(text.results.length, 1);
  assert.equal(text.results[0].line, 1);
  c.db.close();
});
test("metadata and comparison do not require write permission", async () => {
  const { c, ws } = setup();
  const a = path.join(ws, "a.txt"),
    b = path.join(ws, "b.txt");
  fs.writeFileSync(a, "a\nb");
  fs.writeFileSync(b, "a\nc");
  c.save({
    create: false,
    edit: false,
    organise: false,
    workspaces: [{ path: ws, write: false }],
  });
  assert.equal((await c.tool("file_metadata", { path: a })).bytes, 3);
  assert.equal(
    (await c.tool("compare_files", { path: a, other: b })).changes[0].line,
    2,
  );
  c.db.close();
});
test("copy and move never overwrite; recovery blocks changed files", async () => {
  const { c, ws } = setup();
  const a = path.join(ws, "a.txt"),
    b = path.join(ws, "b.txt"),
    d = path.join(ws, "d.txt");
  fs.writeFileSync(a, "original");
  const copy = await c.tool("copy_file", { path: a, destination: b });
  await assert.rejects(
    c.tool("copy_file", { path: a, destination: b }),
    /exists/,
  );
  fs.writeFileSync(b, "changed");
  assert.throws(() => c.files.undo(copy.operation), /changed/);
  const move = await c.tool("move_file", { path: a, destination: d });
  assert.equal(fs.existsSync(a), false);
  c.files.undo(move.operation);
  assert.equal(fs.readFileSync(a, "utf8"), "original");
  assert.equal(fs.existsSync(d), false);
  c.db.close();
});
test("delete is a pending request; stale confirmation refused and recovery restores", async () => {
  const { c, ws } = setup();
  const a = path.join(ws, "a.txt");
  fs.writeFileSync(a, "original");
  const pending = await c.tool("request_delete", { path: a });
  assert.equal(fs.existsSync(a), true);
  fs.writeFileSync(a, "changed");
  assert.throws(() => c.files.confirm(pending.id), /changed/);
  const second = await c.tool("request_delete", { path: a });
  const op = c.files.confirm(second.id);
  assert.equal(fs.existsSync(a), false);
  c.files.undo(op.operation);
  assert.equal(fs.readFileSync(a, "utf8"), "changed");
  c.db.close();
});
test("directory recovery refuses nonempty folders and revoked permissions", async () => {
  const { c, ws } = setup();
  const folder = path.join(ws, "new");
  const op = await c.tool("create_directory", { path: folder });
  fs.writeFileSync(path.join(folder, "a.txt"), "a");
  assert.throws(() => c.files.undo(op.operation), /empty/);
  c.save({ tools: false });
  await assert.rejects(c.tool("search_files", { path: ws, query: "a" }), /OFF/);
  assert.throws(() => c.files.undo(op.operation), /OFF/);
  c.db.close();
});
