# Dyanari 0.2 — verified Windows desktop release

**Historical release notes:** see RELEASE-0.3.md for the current action/validation milestone. Existing setup and privacy/storage details below still apply unless superseded there.

Built and tested on 2 November 2026. **Double-click `Dyanari.exe`** in this folder. `Start-Dyanari.cmd` also opens the executable when available.

## Executable

- A dedicated Windows Forms / WebView2 window, not an Edge app-mode shortcut.
- Single-file, self-contained .NET 10 x64 executable with Node 24 and the application source/UI embedded. The first run extracts its versioned payload under `%LOCALAPPDATA%\Dyanari\app`. No separate Node/.NET installation or paid account is needed to run it.
- Uses the Windows WebView2 runtime already present on this machine. The multi-gigabyte Ollama runtime/model files remain in `runtime/ollama` and `data/models` beside the executable. Copy the entire folder for a complete offline installation, not just the exe. Optional ComfyUI has additional machine-specific dependencies described below.
- Existing `data/dyanari.sqlite` is preserved and migrated. App data stays in this folder when writable; otherwise the desktop host uses `%LOCALAPPDATA%\Dyanari\data`.
- Desktop Core uses a dynamically selected loopback port and stops when its window closes. The host requests cancellation before terminating its own Core. Ollama and optional ComfyUI remain independent local services. A separate source/browser Core on port 17841 can coexist; GPU jobs share a lock in the same data folder.
- Main switches show Internet, Files, Microphone, Screen Vision and Proactive Mode. All default OFF. Creative Studio is separately opt-in.
- External navigation/popups and external WebView resource requests are blocked in the native window. Authorised web research runs through the backend networking gateway, not direct page navigation.
- The executable is locally built and unsigned. No installer, OS startup task or public listener is installed.

## Added in 0.2

**Shared memory update:** all chat models now receive context from one model-independent memory/history service. Changing the selected model preserves the same SQLite memories, personality and project conversation history, including after restart. Embeddings use a separate fixed local model; their cache is keyed by the embedding model, never the chat model. If embeddings are unavailable, recall searches the same project-filtered memory candidates rather than only the newest 100 entries. The Models screen displays shared-memory counts. Three regression tests and `memory-models-integration.mjs` verify switching Qwen3 4B Instruct → Qwen3-VL 2B, recall without supplying conversation history, and recall after a backend restart. Private sessions still do not save new chat or explicit memories.

**File/project work:** recursive filename and literal-text search; metadata; bounded text comparisons; one-folder creation; exclusive copy/move/rename; recoverable file deletion; operation history and undo. Protected folders and symbolic links are skipped during searches. Copy/move refuses existing destinations. Undo refuses changed files or occupied original paths. Folder undo refuses nonempty folders. No recursive delete tool is exposed. Read/Create/Edit/Organise and workspace write permissions remain independent. Existing text edits retain hash-conflict checks and revision backups.

Deletion is a two-step workflow: the model may call `request_delete`, which only creates a five-minute pending request. A user must select **Move to recovery** in Activity and confirm that exact file. The backend checks the current hash again before moving it. Recovery storage is local under `data/recovery`.

**Reminders:** local SQLite reminders, optional recurrence, cancellation, in-app notifications, acknowledgement and quiet hours. Enable Proactive Mode and configure them in Activity; natural-language scheduling tools are also available when enabled. Reminders fire while Core is running and are deferred through quiet hours. No OS background scheduler, push notification service or autonomous project editing is enabled.

**Vision:** local Qwen3-VL 2B Q4_K_M image analysis. Select a PNG/JPEG in Voice & creative studio, ask a question, and inspect it locally. In the desktop app, enable Screen Vision and choose **Capture screen once** to preview the primary display before analysis. Screenshots are not automatically saved to chat/history, are not sent to the internet, and are not taken continuously. The native capture bridge rechecks backend permission. Live desktop capture itself remains unverified; the image-analysis model passed a real image test.

**Voice:** installed local British female speech synthesis, saved voice selection, optional automatic reading of replies, interruption and speech-reactive orb. Microphone recognition uses Windows en-GB recognition and the default device, with explicit permission and a bounded listen-once operation. Actual live microphone recognition is still unverified. Neural voices, hands-free, wake word, voice cloning and device selection remain pending.

**Creative Studio:** local ComfyUI text-to-image jobs, installed checkpoint selection, 512/768/1024 square output, bounded steps/seed controls, job status, local asset library and image downloads. Conversational requests can use the `generate_image` tool when Creative Studio is enabled and its local service is running. This release exposes a fixed standard text-to-image graph, not arbitrary third-party workflows. Img2img, inpainting, outpainting, LoRA controls and upscaling remain pending.

**GPU coordination:** a shared, stale-lock-aware resource lease prevents Dyanari windows sharing this data directory from running GPU tasks at once. Nested generation in an agent chat is supported. Before generation, Dyanari unloads its conversation/vision models from Ollama. After its image job finishes and the ComfyUI queue is empty, it asks ComfyUI to unload models/free memory. This does not control unrelated programs or independent service clients.

## Verified results

- **27 automated tests passed** across `test.mjs`, `files.test.mjs`, `scheduler.test.mjs`, `creative.test.mjs`, `memory-models.test.mjs`, `optional-services.test.mjs` and `vision.test.mjs`. These cover permission denial, workspace boundaries, write conflicts/rollback, file search and organisation, deletion confirmation/recovery, reminders/quiet hours, cross-instance GPU leases and permission revocation, persistent semantic memory across models/restarts, British WAV synthesis and real local image recognition.
- `integration.mjs` passed against real Ollama: authenticated API and foreign-origin checks, internet/file OFF rejection, real HTTPS retrieval, actual model-driven read/edit/read verification, private-history omission and encrypted backup/restore. Restoring resets active permissions OFF.
- `creative-integration.mjs` passed against real local ComfyUI using the existing `epicrealismXL_pure.safetensors`: generated/saved a 512×512 image with 12 steps, seed 42. ComfyUI reported approximately **14.73 seconds** for that job. `sample-artwork.png` is the resulting amethyst robot image. GPU memory returned to roughly 871 MiB after release in the observed check.
- Real Qwen3-VL 2B correctly described a synthetic image as “A red square and a blue circle.”
- The executable's embedded-payload self-test passed. Native-window chat completed using Qwen3 4B Instruct. Final packaging is checked again after source changes.
- Source and runtime stay local. Core inference uses the RTX 3060 8 GB; the conversational model remains Qwen3 4B Instruct at 4096 context. It is **standard, not abliterated**. Other downloaded local models can be selected, but only tested combinations are claimed here.

## ComfyUI setup on this computer

Installed official ComfyUI commit `bb878b9ee35274e67931634ba9e8c338f8c06035` under `runtime/ComfyUI`, with a separate `runtime/comfy-env` environment. It reads Torch/CUDA and already-satisfied packages from the pre-existing Forge environment via a `.pth` file; newer dependencies are installed into Dyanari's own environment. Pip explicitly left packages outside Dyanari's environment untouched. Forge's interpreter/environment and checkpoints were not modified.

This avoids duplicating a large CUDA installation, but makes this optional service dependent on the existing paths:

- Python: `%USERPROFILE%\Desktop\Data\Assets\Python\cpython-3.11.13-windows-x86_64-none`.
- Shared packages: `%USERPROFILE%\Desktop\Data\Packages\Stable Diffusion WebUI Forge - Classic\venv\Lib\site-packages`.
- Read-only model lookup: `%USERPROFILE%\Desktop\Data\Models`, configured in `data/comfy-extra.yaml`.

Choose **Enable Creative Studio**, then **Start local service** and **Refresh models & library**. The service listens only on 127.0.0.1:8188, runs with `--offline`, custom nodes disabled and low-VRAM mode, and writes outputs/user state under Dyanari's data directory. Internet OFF does not block this loopback service. The service start will clearly fail if these local dependencies have moved. Runtime dependency checks may need attention after future upgrades; the installed combination was tested, not every package combination.

## Rebuild / reproduce

Run `build-desktop.ps1 -Dotnet <path-to-.NET-10-SDK\dotnet.exe>` to rebuild the desktop executable from the adjacent source and bundled `runtime/node.exe`. The build creates a compressed app payload and publishes self-contained win-x64. Source is committed locally; binaries, databases, models, recovery storage and build caches are excluded from Git.

```
runtime\node.exe --test test.mjs files.test.mjs scheduler.test.mjs creative.test.mjs optional-services.test.mjs vision.test.mjs
runtime\node.exe integration.mjs
runtime\node.exe memory-models-integration.mjs
runtime\node.exe creative-integration.mjs
Dyanari.exe --self-test
```

The live tests require local Ollama/models, and the creative integration requires local ComfyUI. They create disposable `.dyanari-test-*` folders. The desktop self-test writes `desktop-self-test.json` and exits.

## Remaining full-brief work

General Windows mouse/keyboard automation and approved development command execution; Observe/Assist/Autonomous workflows; live microphone acceptance; richer neural/hands-free voice; format-aware PDF/DOCX/XLSX editing; inferred memory extraction/consolidation; full creative workflow controls; custom character avatar; Android authentication/TLS; signed installer/update workflow; comprehensive adversarial testing and long-session/recovery soak tests. These are not marked complete.

Encrypted backup currently covers settings/personality, memories and chat. Runtime/models, artwork files, reminders, operation/revision history and recovery files require a normal folder backup. Live SQLite, recovery files and audit logs are unencrypted on disk. Private mode omits chat and explicit-memory writes but retains tool audit records. Internet queries can contain model-supplied search terms/URLs: the gateway is a capability boundary, not a data-loss-prevention system. Local model answers and code edits still require review.
