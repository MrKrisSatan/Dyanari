import crypto from "node:crypto";
export const EMBEDDING_MODEL = "all-minilm";
export class MemoryEngine {
  constructor(core) {
    this.core = core;
    core.db.exec(
      "CREATE TABLE IF NOT EXISTS memory_vectors(id INTEGER PRIMARY KEY, digest TEXT, vector TEXT)",
    );
    if (
      !core.db
        .prepare("PRAGMA table_info(memory_vectors)")
        .all()
        .some((c) => c.name === "embedding_model")
    )
      core.db.exec(
        "ALTER TABLE memory_vectors ADD COLUMN embedding_model TEXT NOT NULL DEFAULT 'all-minilm'",
      );
  }
  async embed(input, signal) {
    const r = await fetch(`${process.env.DYANARI_OLLAMA || "http://127.0.0.1:11434"}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input,
        options: { num_gpu: 0 },
        keep_alive: 0,
      }),
      signal: signal || AbortSignal.timeout(30000),
    });
    if (!r.ok) throw Error("Embedding model unavailable");
    const v = (await r.json()).embeddings;
    if (!Array.isArray(v) || v.length !== input.length)
      throw Error("Invalid embedding result");
    return v;
  }
  async retrieve(query, project = "", signal) {
    const memories = this.core.db
      .prepare(
        "SELECT * FROM memories WHERE project='' OR project=? ORDER BY id DESC LIMIT 500",
      )
      .all(project);
    if (!memories.length) return [];
    try {
      const missing = [];
      for (const m of memories) {
        m.digest = crypto.createHash("sha256").update(m.content).digest("hex");
        const row = this.core.db
          .prepare(
            "SELECT * FROM memory_vectors WHERE id=? AND digest=? AND embedding_model=?",
          )
          .get(m.id, m.digest, EMBEDDING_MODEL);
        if (row) m.vector = JSON.parse(row.vector);
        else missing.push(m);
      }
      if (missing.length) {
        const vs = await this.embed(
          missing.map((m) => m.content),
          signal,
        );
        missing.forEach((m, i) => {
          m.vector = vs[i];
          this.core.db
            .prepare(
              "INSERT OR REPLACE INTO memory_vectors(id,digest,vector,embedding_model) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM memories WHERE id=? AND content=? AND project=?)",
            )
            .run(m.id, m.digest, JSON.stringify(m.vector), EMBEDDING_MODEL,m.id,m.content,m.project);
        });
      }
      const [q] = await this.embed([query], signal);
      const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
      return memories
        .map((m) => ({
          id: m.id,
          content: m.content,
          project: m.project,
          score:
            dot(m.vector, q) / Math.sqrt(dot(m.vector, m.vector) * dot(q, q)),
        }))
        .filter((m) => m.score > 0.2)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);
    } catch (e) {
      if (signal?.aborted) throw e;
      this.core.log(
        "memory",
        "Semantic retrieval unavailable; keyword fallback",
      );
      const words = [
        ...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []),
      ];
      return memories
        .map(({ id, content, project }) => ({
          id,
          content,
          project,
          score: words.reduce(
            (score, word) =>
              score + Number(content.toLowerCase().includes(word)),
            0,
          ),
        }))
        .filter((m) => m.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);
    }
  }
  // Shared application context deliberately accepts no chat-model identifier.
  // Switching a model changes inference only, never the memory/history store.
  async context({
    query,
    project = "",
    privateMode = false,
    history = [],
    signal,
  }) {
    const messages = privateMode
      ? Array.isArray(history)
        ? history
            .filter(
              (m) =>
                ["user", "assistant"].includes(m.role) &&
                typeof m.content === "string",
            )
            .slice(-16)
            .map((m) => ({ role: m.role, content: m.content.slice(0, 12000) }))
        : []
      : this.core.db
          .prepare(
            "SELECT role,content FROM (SELECT * FROM messages WHERE project=? ORDER BY id DESC LIMIT 16) ORDER BY id",
          )
          .all(project);
    return {
      history: messages,
      memories: (await this.retrieve(query, project, signal)).flatMap(m=>{let detail;try{detail=this.core.memoryLedger.get(m.id)}catch{return []}if(detail.content!==m.content||detail.project!==m.project)return [];return [{...m,category:detail.category,source:detail.source}]}),
    };
  }
  status() {
    return {
      sharedAcrossModels: true,
      embeddingModel: EMBEDDING_MODEL,
      pendingSuggestions:this.core.db.prepare('SELECT count(*) n FROM memory_suggestions').get().n,
      savedMemories: this.core.db
        .prepare("SELECT count(*) n FROM memories")
        .get().n,
      storedMessages: this.core.db
        .prepare("SELECT count(*) n FROM messages")
        .get().n,
    };
  }
  extractExplicit(text, project = "") {
    const m = text.match(/^remember(?: that)?\s*[:,-]?\s+([\s\S]{3,1000})$/i);
    if (m) this.core.remember(m[1], project);
  }
}
