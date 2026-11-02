import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Core } from "./core.mjs";
import { MemoryEngine } from "./memory.mjs";
import { voices, synthesise } from "./voice.mjs";
test("local semantic retrieval and project isolation", async () => {
  const tmp = fs.mkdtempSync(
    path.join(process.cwd(), ".dyanari-test-semantic-"),
  );
  const c = new Core(tmp),
    m = new MemoryEngine(c);
  m.extractExplicit("Remember that I enjoy drinking Earl Grey tea");
  m.extractExplicit(
    "Remember that dragons live in northern mountains",
    "Fantasy",
  );
  const result = await m.retrieve("What hot beverage do I like?");
  assert.match(result[0].content, /Earl Grey/);
  assert.ok(result.every((v) => v.project === ""));
  const lore = await m.retrieve("Where do dragons live?", "Fantasy");
  assert.match(lore[0].content, /mountains/);
  const other = await m.retrieve("Where do dragons live?", "Sevenfall");
  assert.ok(other.every((v) => v.project !== "Fantasy"));
  c.db.close();
});
test("local British female voice generates valid PCM WAV", async () => {
  const vs = await voices();
  const female = vs.find((v) => v.culture === "en-GB" && v.gender === "Female");
  assert.ok(female);
  const wav = await synthesise("Hello, I am Dyanari.", female.name);
  assert.equal(wav.subarray(0, 4).toString(), "RIFF");
  assert.equal(wav.subarray(8, 12).toString(), "WAVE");
  assert.ok(wav.length > 10000);
});
