import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Core } from "./core.mjs";
test("creative jobs enforce permission and parameter bounds", async () => {
  const c = new Core(
    fs.mkdtempSync(path.join(process.cwd(), ".dyanari-test-creative-")),
  );
  await assert.rejects(c.creative.generate({}), /OFF/);
  c.save({ creative: true });
  await assert.rejects(
    c.creative.generate({
      prompt: "test",
      negative: "",
      width: 200,
      height: 512,
      steps: 4,
      seed: 1,
    }),
    /dimensions/,
  );
  c.db.close();
});
test("GPU resource lease excludes another instance and permits nested agent workflow", () => {
  const dir = fs.mkdtempSync(
      path.join(process.cwd(), ".dyanari-test-resource-"),
    ),
    a = new Core(dir),
    b = new Core(dir);
  const release = a.resources.acquire("conversation");
  assert.throws(() => b.resources.acquire("vision"), /using the GPU/);
  const inner = a.resources.acquire("generation");
  inner();
  assert.throws(() => b.resources.acquire("vision"), /using the GPU/);
  release();
  b.resources.acquire("vision")();
  a.db.close();
  b.db.close();
});
