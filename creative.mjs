import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import {QwenImageRuntime,qwenGraph} from './qwen-image.mjs';
import {ImageInspiration} from './image-inspiration.mjs';
const legacyEndpoint = 'http://127.0.0.1:8188';
export const creativeDefinitions = [
  [
    "generate_image",
    "Generate and save one real local image. Creative Studio must be ON. Use checkpoint qwen-image-2.1 for its installed hardware-selected bundle. Only prompt is required; defaults select that bundle, its recommended resolution and 25 steps. Other installed SD checkpoints remain supported. Optional width/height 256–1024 in multiples of 64, steps 1–30.",
    {
      prompt: "string",
      negative: "string",
      checkpoint: "string",
      width: "number",
      height: "number",
      steps: "number",
      seed: "number",
    },
  ],
];
export class CreativeEngine {
  constructor(core) {
    this.core = core;
    this.job = null;
    this.qwen = new QwenImageRuntime(core);
    this.endpoint = legacyEndpoint;
    this.inspiration = new ImageInspiration(core,this);
    this.home =
      process.env.DYANARI_HOME || path.dirname(fileURLToPath(import.meta.url));
    core.db.exec(
      "CREATE TABLE IF NOT EXISTS artworks(id TEXT PRIMARY KEY,prompt TEXT,checkpoint TEXT,file TEXT,stamp TEXT DEFAULT CURRENT_TIMESTAMP)",
    );
    for(const [column,definition] of [['model',"TEXT DEFAULT ''"],['origin',"TEXT DEFAULT 'requested'"]])if(!core.db.prepare('PRAGMA table_info(artworks)').all().some(c=>c.name===column))core.db.exec('ALTER TABLE artworks ADD COLUMN '+column+' '+definition);
  }
  enabled() {
    if (!this.core.settings.creative) throw Error("Creative Studio is OFF");
  }
  async request(route, body, signal, endpoint=this.endpoint) {
    const r = await fetch(endpoint + route, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: signal ? AbortSignal.any([signal,AbortSignal.timeout(30000)]) : AbortSignal.timeout(10000),
    });
    if (!r.ok)
      throw Error(
        "ComfyUI " + r.status + ": " + (await r.text()).slice(0, 1000),
      );
    return r;
  }
  async state() {
    let available = false,
      checkpoints = [];
    try {
      await this.request("/system_stats",undefined,undefined,legacyEndpoint);
      available = true;
      const info = await (
        await this.request("/object_info/CheckpointLoaderSimple",undefined,undefined,legacyEndpoint)
      ).json();
      checkpoints =
        info.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
    } catch {}
    const qwen = await this.qwen.state();
    const capability = qwen.installed ? await this.qwen.capability() : {ready:false};
    if(qwen.installed)checkpoints.push("qwen-image-2.1");
    return {
      qwen:{...qwen,...capability},
      inspiration:this.inspiration.state(),
      available:available||capability.ready,
      checkpoints,
      job: this.job,
      artworks: this.core.db
        .prepare("SELECT * FROM artworks ORDER BY stamp DESC LIMIT 60")
        .all(),
    };
  }
  async start() {
    this.enabled();
    if(this.qwen.installation)return this.qwen.start();
    try {
      await this.request("/system_stats");
      return { running: true };
    } catch {}
    const python = path.join(this.home, "runtime/comfy-env/Scripts/python.exe"),
      source = path.join(this.home, "runtime/ComfyUI");
    if (!fs.existsSync(python) || !fs.existsSync(path.join(source, "main.py")))
      throw Error("ComfyUI runtime is not installed beside Dyanari.exe");
    const config = path.join(this.core.dir, "comfy-extra.yaml");
    if (!fs.existsSync(config))
      throw Error("Configure data/comfy-extra.yaml with local model folders");
    const output = path.join(this.core.dir, "comfy-output"),
      user = path.join(this.core.dir, "comfy-user");
    fs.mkdirSync(output, { recursive: true });
    fs.mkdirSync(user, { recursive: true });
    const child = spawn(
      python,
      [
        "main.py",
        "--listen",
        "127.0.0.1",
        "--port",
        "8188",
        "--disable-auto-launch",
        "--disable-all-custom-nodes",
        "--offline",
        "--lowvram",
        "--extra-model-paths-config",
        config,
        "--output-directory",
        output,
        "--user-directory",
        user,
      ],
      {
        cwd: source,
        windowsHide: true,
        detached: true,
        env: {
          ...process.env,
          HF_HUB_OFFLINE: "1",
          TRANSFORMERS_OFFLINE: "1",
          HF_HUB_DISABLE_TELEMETRY: "1",
        },
        stdio: [
          "ignore",
          fs.openSync(path.join(this.core.dir, "comfy-out.log"), "a"),
          fs.openSync(path.join(this.core.dir, "comfy-error.log"), "a"),
        ],
      },
    );
    child.unref();
    this.core.log("creative", "Starting local offline ComfyUI");
    return { starting: true };
  }
  async unloadConversation() {
    const r = await fetch(`${process.env.DYANARI_OLLAMA || "http://127.0.0.1:11434"}/api/ps`, {
      signal: AbortSignal.timeout(10000),
    });
    const models = (await r.json()).models || [];
    for (const m of models) {
      if ([this.core.settings.model, "qwen3-vl:2b"].includes(m.name))
        await fetch(`${process.env.DYANARI_OLLAMA || "http://127.0.0.1:11434"}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: m.name, keep_alive: 0, stream: false }),
          signal: AbortSignal.timeout(30000),
        });
    }
  }
  async generate(a, signal, origin='requested') {
    this.enabled();
    const bundle=this.qwen.installation?.bundle;
    a={negative:'',checkpoint:bundle?'qwen-image-2.1':'',width:bundle?.resolution||512,height:bundle?.resolution||512,steps:bundle?.steps||20,seed:crypto.randomInt(0,2147483647),...a};
    if (this.job) throw Error("An image job is already active");
    if (
      typeof a.prompt !== "string" ||
      !a.prompt.trim() ||
      a.prompt.length > 3000 ||
      typeof a.negative !== "string" ||
      a.negative.length > 3000
    )
      throw Error("Invalid image prompt");
    const researched=this.core.research?.visualBrief(a.prompt);
    if(researched?.text&&a.prompt.length<2700)a.prompt+='\nResearched appearance details: '+researched.text.slice(0,3000-a.prompt.length-32);
    for (const n of ["width", "height"])
      if (!Number.isInteger(a[n]) || a[n] < 256 || a[n] > 1024 || a[n] % 64)
        throw Error(
          "Image dimensions must be multiples of 64 from 256 to 1024",
        );
    if (
      !Number.isInteger(a.steps) ||
      a.steps < 1 ||
      a.steps > 30 ||
      !Number.isSafeInteger(a.seed) ||
      a.seed < 0
    )
      throw Error("Invalid steps or seed");
    const isQwen=a.checkpoint==='qwen-image-2.1';
    const own=new AbortController();this.controller=own;this.core.controllers.add(own);signal=AbortSignal.any([own.signal,AbortSignal.timeout(isQwen?1800000:600000),...(signal?[signal]:[])]);let restoreVoice=false;
    this.job={status:'checking',prompt:a.prompt};let id;
    try{
    if(isQwen&&this.core.voiceStudio?.active)throw Error('Speech is generating; stop it before starting a large image job');
    if(isQwen&&this.core.voiceStudio?.child){restoreVoice=true;this.core.voiceStudio.stop();await delay(1000,undefined,{signal})}
    if(isQwen){await this.qwen.start();const until=Date.now()+120000;for(let i=0;Date.now()<until;i++){if(signal.aborted)throw Error('Cancelled');if((await this.qwen.capability()).ready)break;await delay(500,undefined,{signal})}}
    const state = await this.state();
    this.enabled();if(signal.aborted)throw Error('Cancelled');
    if(isQwen&&!state.qwen.ready)throw Error('Qwen Image 2.1 is not ready: '+(state.qwen.reason||'start its installed service'));
    this.endpoint=isQwen?this.qwen.endpoint:legacyEndpoint;
    if (!state.available) throw Error("Start the local ComfyUI service first");
    if (!state.checkpoints.includes(a.checkpoint))
      throw Error("Select an installed checkpoint: "+state.checkpoints.join(', '));
    this.job = { status: "preparing", prompt: a.prompt };
      await this.unloadConversation();
      const graph = isQwen?qwenGraph(a,bundle):{
        1: {
          class_type: "CheckpointLoaderSimple",
          inputs: { ckpt_name: a.checkpoint },
        },
        2: {
          class_type: "CLIPTextEncode",
          inputs: { text: a.prompt, clip: ["1", 1] },
        },
        3: {
          class_type: "CLIPTextEncode",
          inputs: { text: a.negative, clip: ["1", 1] },
        },
        4: {
          class_type: "EmptyLatentImage",
          inputs: { width: a.width, height: a.height, batch_size: 1 },
        },
        5: {
          class_type: "KSampler",
          inputs: {
            seed: a.seed,
            steps: a.steps,
            cfg: 7,
            sampler_name: "euler",
            scheduler: "normal",
            denoise: 1,
            model: ["1", 0],
            positive: ["2", 0],
            negative: ["3", 0],
            latent_image: ["4", 0],
          },
        },
        6: {
          class_type: "VAEDecode",
          inputs: { samples: ["5", 0], vae: ["1", 2] },
        },
        7: {
          class_type: "SaveImage",
          inputs: { filename_prefix: "Dyanari", images: ["6", 0] },
        },
      };
      const result = await (
        await this.request(
          "/prompt",
          { prompt: graph, client_id: "dyanari-" + crypto.randomUUID() },
          signal,
        )
      ).json();
      if (result.error || !result.prompt_id)
        throw Error(JSON.stringify(result));
      id = result.prompt_id;
      this.job = { id, status: "generating", prompt: a.prompt };
      this.core.log("creative", "Queued " + id);
      for (let i = 0; i < (isQwen?1800:600); i++) {
        this.enabled();
        if (signal?.aborted) throw Error("Cancelled");
        const history = await (
            await this.request(
              "/history/" + encodeURIComponent(id),
              undefined,
              signal,
            )
          ).json(),
          job = history[id];
        if (job) {
          if (job.status?.status_str === "error")
            throw Error(
              "Image generation failed: " +
                JSON.stringify(job.status.messages).slice(0, 1000),
            );
          const image = job.outputs?.["7"]?.images?.[0];
          if (image) {
            const query = new URLSearchParams({
              filename: image.filename,
              subfolder: image.subfolder || "",
              type: "output",
            });
            const r = await this.request("/view?" + query, undefined, signal);
            const chunks=[];let total=0;for await(const part of r.body){total+=part.length;if(total>30*1024*1024)throw Error('Generated image too large');chunks.push(part)}const bytes=Buffer.concat(chunks);
            if (
              bytes.length > 30 * 1024 * 1024 ||
              !bytes
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            )
              throw Error("Unexpected generated output");
            const asset = crypto.randomUUID(),
              folder = path.join(this.core.dir, "artworks");
            fs.mkdirSync(folder, { recursive: true });
            const file = path.join(folder, asset + ".png");
            fs.writeFileSync(file, bytes, { flag: "wx" });
            this.core.db
              .prepare(
                "INSERT INTO artworks(id,prompt,checkpoint,file,model,origin) VALUES(?,?,?,?,?,?)",
              )
              .run(asset, a.prompt, a.checkpoint, file,isQwen?bundle.id:a.checkpoint,origin);
            this.core.log("creative", "Saved artwork " + asset);
            return { id: asset, prompt: a.prompt, file, local: true, model:isQwen?bundle.name:a.checkpoint };
          }
        }
        await delay(1000, undefined, { signal });
      }
      throw Error("Generation timed out");
    } catch (e) {
      if (id)
        try {
          await this.request(
            "/api/jobs/" + encodeURIComponent(id) + "/cancel",
            {},
          );
        } catch {}
      throw e;
    } finally {
      this.core.controllers.delete(own);if(this.controller===own)this.controller=null;
      this.job = null;
      try {
        const q = await (await this.request("/queue")).json();
        if (!q.queue_running?.length && !q.queue_pending?.length)
          await this.request("/free", {
            unload_models: true,
            free_memory: true,
          });
      } catch {}
      if(isQwen&&os.totalmem()<24*1024**3&&this.qwen.child)this.qwen.stop();
      if(restoreVoice&&!signal.aborted&&this.core.settings.voiceStudioEnabled&&this.core.settings.speechProvider==='voicestudio')try{await this.core.voiceStudio.start()}catch(e){this.core.log('voice',e.message)}
    }
  }
  cancel(){this.controller?.abort();this.inspiration.cancel()}
  asset(id) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw Error("Invalid artwork");
    const row = this.core.db
      .prepare("SELECT * FROM artworks WHERE id=?")
      .get(id);
    if (!row) throw Error("Artwork not found");
    return row;
  }
}
