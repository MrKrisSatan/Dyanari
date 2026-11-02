import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { Core } from "./core.mjs";
const dir = fs.mkdtempSync(
    path.join(process.cwd(), ".dyanari-test-creative-live-"),
  ),
  c = new Core(dir);
c.save({ creative: true });
const release = c.resources.acquire("creative acceptance test");
try {
  const result = await c.creative.generate(
    {
      prompt:
        "A tiny amethyst crystal robot on a charcoal desk, cozy studio lighting, detailed miniature, centered, no text",
      negative: "blurry, text, watermark",
      checkpoint: "epicrealismXL_pure.safetensors",
      width: 512,
      height: 512,
      steps: 12,
      seed: 42,
    },
    AbortSignal.timeout(600000),
  );
  const bytes = fs.readFileSync(result.file);
  assert.equal(bytes.subarray(1, 4).toString(), "PNG");
  fs.copyFileSync(result.file, "sample-artwork.png");
  console.log("PASS real local ComfyUI generation saved " + result.file);
  console.log("Sample copied to sample-artwork.png");
} finally {
  release();
  c.db.close();
}
