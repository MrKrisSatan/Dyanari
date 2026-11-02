import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Core } from "./core.mjs";
import { MemoryEngine, EMBEDDING_MODEL } from "./memory.mjs";
const setup = () =>
  new Core(
    fs.mkdtempSync(path.join(process.cwd(), ".dyanari-test-memory-models-")),
  );
function deterministic(engine) {
  engine.embed = async (inputs) => inputs.map(() => [1, 0]);
}
test("saved memory, conversation, personality and vector cache survive model changes and restart", async () => {
  const c = setup(),
    dir = c.dir,
    m = new MemoryEngine(c);
  deterministic(m);
  c.save({
    personality: "Dyanari remembers across models.",
    model: "qwen3:4b-instruct",
  });
  m.extractExplicit(
    "Remember that my workshop code is AMETHYST-7429",
    "Workshop",
  );
  c.db
    .prepare("INSERT INTO messages(role,content,project) VALUES(?,?,?)")
    .run("user", "We are building the clockwork engine.", "Workshop");
  const first = await m.context({
    query: "workshop code",
    project: "Workshop",
  });
  const vectors = c.db.prepare("SELECT * FROM memory_vectors").all();
  c.save({ model: "qwen3-vl:2b" });
  assert.deepEqual(
    await m.context({ query: "workshop code", project: "Workshop" }),
    first,
  );
  assert.deepEqual(c.db.prepare("SELECT * FROM memory_vectors").all(), vectors);
  assert.equal(vectors[0].embedding_model, EMBEDDING_MODEL);
  c.db.close();
  const reopened = new Core(dir),
    again = new MemoryEngine(reopened);
  deterministic(again);
  assert.equal(reopened.settings.model, "qwen3-vl:2b");
  assert.equal(
    reopened.settings.personality,
    "Dyanari remembers across models.",
  );
  assert.deepEqual(
    await again.context({ query: "workshop code", project: "Workshop" }),
    first,
  );
  assert.equal(again.status().savedMemories, 1);
  assert.equal(again.status().storedMessages, 1);
  reopened.db.close();
});
test("fallback recalls older shared memories after a switch and respects project boundaries", async () => {
  const c = setup(),
    m = new MemoryEngine(c);
  c.remember("My workshop code is AMETHYST-7429", "Workshop");
  c.remember("The hidden workshop code is DRAGON-9999", "Fantasy");
  for (let i = 0; i < 150; i++) c.remember("Other unrelated fact number " + i);
  c.save({ model: "qwen3-vl:2b" });
  m.embed = async () => {
    throw Error("Embedding service unavailable");
  };
  const result = await m.context({
    query: "workshop code",
    project: "Workshop",
  });
  assert.equal(result.memories.length, 1);
  assert.match(result.memories[0].content, /AMETHYST-7429/);
  assert.ok(result.memories.every((v) => v.project !== "Fantasy"));
  c.db.close();
});
test("private context remains temporary during model changes", async () => {
  const c = setup(),
    m = new MemoryEngine(c);
  deterministic(m);
  c.remember("My favourite colour is purple");
  const history = [{ role: "user", content: "This conversation is private." }];
  const first = await m.context({
    query: "colour",
    privateMode: true,
    history,
  });
  c.save({ model: "qwen3-vl:2b" });
  assert.deepEqual(
    await m.context({ query: "colour", privateMode: true, history }),
    first,
  );
  assert.equal(c.db.prepare("SELECT count(*) n FROM messages").get().n, 0);
  assert.equal(c.memories().length, 1);
  c.db.close();
});
