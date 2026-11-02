import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Core } from "./core.mjs";
test("Python syntax checking is isolated and handles UTF-8 without executing source", async () => {
  const dir = fs.mkdtempSync(path.join(process.cwd(), ".dyanari-test-python-")),
    workspace = path.join(dir, "project");
  fs.mkdirSync(workspace);
  const c = new Core(path.join(dir, "data"));
  c.save({
    tools: true,
    runTools: true,
    workspaces: [{ path: workspace, write: false }],
  });
  const file = path.join(workspace, "example.py"),
    marker = path.join(workspace, "never-execute.txt");
  fs.writeFileSync(
    file,
    'import pathlib\n变量 = "purple"\npathlib.Path(' +
      JSON.stringify(marker) +
      ').write_text("executed")\n',
  );
  const result = await c.tool("check_project_file", { path: file });
  assert.equal(result.passed, true);
  assert.equal(result.executedSource, false);
  assert.equal(fs.existsSync(marker), false);
  fs.writeFileSync(file, "def broken(:\n");
  assert.equal(
    (await c.tool("check_project_file", { path: file })).passed,
    false,
  );
  c.db.close();
});
