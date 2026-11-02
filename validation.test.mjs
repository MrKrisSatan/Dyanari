import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ValidationTracker } from "./validation.mjs";
import { Core } from "./core.mjs";
test("repair feedback is bounded and stops once the changed file passes verification", () => {
  const v = new ValidationTracker("Fix the syntax error and verify it");
  v.observe("check_project_file", { path: "source.mjs", passed: false });
  assert.match(v.continueFeedback(true), /unfinished/);
  v.observe("edit_file", { path: "source.mjs" });
  assert.ok(v.warning());
  v.observe("check_project_file", { path: "source.mjs", passed: true });
  assert.equal(v.continueFeedback(true), null);
  assert.equal(v.warning(), "");
  const failure = new ValidationTracker("Repair source");
  failure.observe("check_project_file", { path: "broken.js", passed: false });
  assert.ok(failure.continueFeedback(true));
  assert.ok(failure.continueFeedback(true));
  assert.equal(failure.continueFeedback(true), null);
});
test("validation feedback never turns a read-only request into an edit authorisation", () => {
  for (const request of [
    "Only check the file",
    "Do not edit, just find the syntax error",
    "Inspect the project",
  ]) {
    const v = new ValidationTracker(request);
    v.observe("check_project_file", { path: "source.mjs", passed: false });
    assert.equal(v.continueFeedback(true), null);
    assert.match(v.warning(), /has not passed/);
  }
  const v = new ValidationTracker("Fix source");
  v.observe("check_project_file", { path: "source.mjs", passed: false });
  assert.equal(v.continueFeedback(false), null);
});
test("model tool exposure follows detailed permissions and excludes unsupported actions", () => {
  const c = new Core(
    fs.mkdtempSync(path.join(process.cwd(), ".dyanari-test-tools-")),
  );
  assert.equal(c.toolAvailable("read_file"), false);
  c.save({ tools: true, edit: true, runTools: true });
  assert.equal(c.toolAvailable("read_file"), true);
  assert.equal(c.toolAvailable("edit_file"), true);
  assert.equal(c.toolAvailable("check_project_file"), true);
  assert.equal(c.toolAvailable("move_file"), false);
  assert.equal(c.toolAvailable("list_windows"), false);
  assert.equal(c.toolAvailable("run_shell"), false);
  c.save({ read: false });
  assert.equal(c.toolAvailable("read_file"), false);
  assert.equal(c.toolAvailable("check_project_file"), false);
  c.db.close();
});
