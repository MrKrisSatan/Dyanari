import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
export class ResourceManager {
  constructor(dir, fileName = "gpu-task.lock", label = "GPU") {
    this.file = path.join(dir, fileName);
    this.label = label;
    this.depth = 0;
    this.id = crypto.randomUUID();
  }
  acquire(kind) {
    if (this.depth) {
      this.depth++;
      return () => this.release();
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        fs.writeFileSync(
          this.file,
          JSON.stringify({ pid: process.pid, id: this.id, kind }),
          { flag: "wx" },
        );
        this.depth = 1;
        return () => this.release();
      } catch (e) {
        if (e.code !== "EEXIST") throw e;
        let old;
        try {
          old = JSON.parse(fs.readFileSync(this.file, "utf8"));
        } catch {
          throw Error(this.label + " task lock is unreadable; restart Dyanari");
        }
        try {
          process.kill(old.pid, 0);
        } catch (err) {
          if (err.code === "ESRCH") {
            fs.unlinkSync(this.file);
            continue;
          }
          throw Error(
            "Another local " + this.label + " task holds the resource lock",
          );
        }
        throw Error(
          "Another Dyanari window is using the " +
            this.label +
            " for " +
            old.kind,
        );
      }
    }
    throw Error(this.label + " resource unavailable");
  }
  release() {
    if (this.depth > 0) this.depth--;
    if (!this.depth) {
      try {
        const old = JSON.parse(fs.readFileSync(this.file, "utf8"));
        if (old.id === this.id) fs.unlinkSync(this.file);
      } catch {}
    }
  }
}
