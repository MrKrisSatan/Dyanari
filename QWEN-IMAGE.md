# Qwen Image 2.1 in Dyanari

The integration follows the [requested guide](https://locallyuncensored.com/qwen-image-2-1/) and uses pinned ComfyUI 0.43.0, leejet/ComfyUI-GGUF and the native `TextEncodeQwenImage21` workflow. It generates images from text; image editing, masks, acceleration LoRAs, prompt enhancement and other creative workflows are separate work.

## Installation and quantization

The Windows x64 installer has an optional image setup section beside the existing text-model selection. It measures system RAM and NVIDIA VRAM, recommends a complete bundle, shows its size and lets you choose another tier or skip it. Image installation and model-term acceptance are unchecked by default. You can also use **Voice & creative studio → Refresh models & library → Install / repair selected image bundle** after enabling Internet.

| Tier | RAM guidance | NVIDIA VRAM guidance | Encoder | Default image |
|---|---:|---:|---|---:|
| Q2_K | 16 GB | 6 GB | Heretic Q4 + matching vision projector | 512×512 |
| Q4_K_M | 16 GB | 8 GB | Heretic Q4 + matching vision projector | 512×512 |
| Q5_K_M | 32 GB | 12 GB | Official INT8 | 768×768 |
| Q6_K | 48 GB | 16 GB | Official INT8 | 1024×1024 |
| Q8_0 | 64 GB | 24 GB | Official INT8 | 1024×1024 |

These are conservative selection rules, not measurements on every listed device. Q2 and Q4 were actually rendered at 512×512/25 steps on a 16 GB RAM, RTX 3060 **8 GB** machine. Q4 was clearer and is now recommended there. Lower quantization can noticeably reduce quality. Higher tiers and community UC diffusion variants remain unverified on physical hardware. The compact pipeline uses an original-weight Unsloth diffusion quantization **and a community-modified Heretic text encoder**; it is not an entirely unmodified pipeline. Community “uncensored” labels are authors' descriptions, not a guarantee.

Every bundle includes diffusion weights, a compatible text encoder, the new Qwen 2.1 VAE and, for compact GGUF encoders, the required matching mmproj. Download sizes cover all these files. Sources, immutable revisions, exact bytes and SHA-256 hashes are in `image-catalog.json`. Incomplete or mismatched bundles are not treated as ready. The required nodes and filenames must also be advertised by the running service.

The isolated runtime is `%USERPROFILE%\.dyanari\images`: its own Python packages, frozen uv lock, ComfyUI source, two whitelisted custom nodes and model folders. It does not use a developer's Forge packages. Public installers contain setup/configuration, not weights. Models and artwork survive reinstall/uninstall. Allow space for several GB of runtime dependencies as well as the complete selected bundle. Setup logs are in `<Dyanari data>/image-setup.log`; service logs are in `qwen-service.log`.

CLI alternative:

```powershell
.\setup-images.ps1 -BundleId q4 -AcceptResearchTerms
```

Only pass that switch after reviewing the pinned Qwen Research License linked by the catalog. Its published grant is for research/evaluation; it does not grant general commercial use. A copy is downloaded and verified into the model folder. Other applicable model/component terms still apply. For a separately authorised CPU-only experiment, add `-Cpu`; CPU startup was checked, but full CPU rendering has not been benchmarked and can be extremely slow. Machines without a suitable detected NVIDIA/RAM combination default to skipping image setup; an explicit hardware override is required in the UI.

Advanced environment overrides: `DYANARI_IMAGE_HOME` must be an absolute runtime directory, and `DYANARI_QWEN_PORT` a numeric loopback port (default 8189). Setup also accepts `-RuntimeRoot`. Keep paths short on Windows. Existing SD/SDXL integration on port 8188 remains separate.

## Requested images

Enable Creative Studio, then ask Dyanari to draw an image. `generate_image` requires only a prompt and defaults to the installed Qwen bundle, its recommended size and 25 steps. The app starts the installed service when needed. You can also select `qwen-image-2.1` in the studio and use Generate locally. Actual returned PNG bytes are saved in the artwork library and displayed after successful chat tool execution. A model promise or a queued prompt is never treated as a completed image.

The workflow uses the native 2.1 conditioning node, paired positive/negative outputs, CFG 1, Euler/simple sampling and the correct VAE. These are the official template defaults; at CFG 1 negative-conditioning influence is limited by the sampler. The compact encoder is forced onto CPU RAM while diffusion uses the GPU. One image runs at a time under the existing profile GPU lease. Conversation models unload before rendering; completed image models unload afterwards. On systems below 24 GB RAM the owned image process is also released between jobs. An idle, owned VoiceStudio process can be suspended for image generation and restarted after successful completion. Active speech is not silently interrupted, and external services are not killed to reclaim memory.

Managed services run with offline flags and partner/API nodes disabled. Only the pinned GGUF loader and Dyanari CPU-encoder adapter are whitelisted; unrelated custom nodes are disabled. Internet must be ON for app-managed setup and can be OFF for rendering. These are application controls, not an OS firewall or an execution sandbox.

## Images Dyanari initiates

Enable Creative Studio, Proactive Mode and **Allow spontaneous background images**, choose a theme, interval and daily limit, then Save / resume. The default is OFF, one image per UTC day and at least an hour between decisions. The local chat model can choose an original prompt or decline. It receives only the theme, not chats, memories, screens or files. It cannot approve installs or execute arbitrary tools through this path.

Quiet hours, busy work, active speech, insufficient free RAM, cooldown and the daily budget prevent admission. Decision attempts and completed artwork ids persist in SQLite across model changes/restarts. Interrupted reservations are not automatically replayed; inspect their actual state before manually resuming. Failed/declined decisions retain a cooldown. Stop all tasks, or Stop images, cancels active work and persistently pauses this scheduler until explicitly resumed. Cancelling an external ComfyUI request targets only its prompt id; owned processes can be terminated. Already saved images are not rolled back.

Artworks, their prompts, inspiration records and tool effects persist independently of private chat storage. Private chat does not make an explicit image-generation file operation ephemeral. Memory/chat backups do not include the image library or large runtimes; back up those directories separately.

## Validation and remaining work

Real acceptance: isolated dependency/model installation; Q2 and Q4 PNG renders at 512×512, 25 steps; actual Qwen3 4B Instruct decision → original prompt → actual Q4 render → saved artwork and consumed daily quota, without storing chat memory. Representative Q4 rendering took about 148 seconds; the full spontaneous flow about 150 seconds on this workstation. CPU-only startup and both whitelisted custom nodes were checked.

Fixtures additionally cover permissions, exact queued graph, PNG delivery through the authenticated API and chat tools, decline/failure, budgets, restart persistence, quiet hours, revocation, targeted cancellation and Stop pause. See `qwen-image.test.mjs`, `qwen-image-http-integration.mjs` and `BUILD-INFO.json`. Fresh-machine installer acceptance, full CPU/AMD image rendering, all higher quantizations, and advanced edit workflows remain open in TODO.md.
