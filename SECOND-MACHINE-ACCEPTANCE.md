# Second-machine inspection and acceptance — 2 November 2026

## Scope and baseline

Inspected the repository history, tracker, architecture, capability/permission routing, persistent memory/task flows, optional-service setup and lifecycle, UI, native packaging and CI. Baseline: main commit `9db9e11`, release `v0.10.0`.

The architecture is a native .NET/WebView2 shell around an authenticated loopback Node/SQLite application. Ollama handles conversation; separate pinned Python environments provide image, mesh and voice generation. SQLite owns memory and settings independently of model selection. Tool availability, workspace resolution and execution approvals are enforced by application code. External processes are not OS sandboxes.

This was a fresh Dyanari installation on an existing Windows 11 Home x64 machine, build 26200, with approximately 32 GB RAM and an NVIDIA RTX 4080 SUPER (16 GB VRAM). WebView2 and an unrelated Ollama installation already existed. Dyanari was absent from its per-user install/data locations before testing. This is not a pristine Windows/VM test.

## Installation evidence

- Downloaded the public 0.10.0 installer, 210,259,476 bytes, and verified SHA-256 `93da82cb46744a3c333fd41d000c65a7e4c5c049034af53117af349de97cd19f` against the release metadata.
- The setup wizard is PowerShell-hosted and was not targetable by the available UI automation. Used its extracted, inspected setup implementation with a scripted model selection. The download and hidden-process fixes in 0.10.1 were required to finish; this is not a claim that the unmodified 0.10.0 wizard passed end to end.
- Installed the pinned Ollama, MinGit, GitHub CLI and Node runtimes, verified/downloaded/imported the catalog's 8B Q4 model, wrote per-user installation configuration, Start menu shortcuts and uninstall registration.
- The existing unrelated Ollama process was preserved. The installed application uses its own loopback endpoint and model directory.
- Native window launch and local inference connection verified. The first private conversation produced a real introduction and correctly answered 17 + 25 = 42 in about 48 seconds including cold model startup. Stored messages remained zero.
- VoiceStudio's complete web build, pinned OmniVoice/Whisper models and saved British Velvet identity were installed. Actual synthesis produced a valid 203,646-byte WAV. Local ASR recovered the test sentence, spelling the name as “Janari.” No microphone was used.
- Community UC Q4 diffusion, Heretic Q4 encoder, matching projector and Qwen 2.1 VAE were installed and hash-verified. A slow direct diffusion download was completed through the pinned Hugging Face revision/cache and checked against the catalog SHA-256 before reuse by setup.
- Actual UC/Heretic 512×512, 25-step image generation saved a 206,163-byte PNG in 145 seconds including cold startup. The rendered clay animal was visually inspected.
- TripoSG was installed with its pinned native CUDA dependency and complete geometry bundle. A direct weight transfer disconnected; the immutable revision was fetched through Hugging Face, independently hash-verified, and accepted by a repeated frozen setup.
- Actual image → TripoSG balanced-quality inference produced a 37,500,084-byte STL in 73 seconds: 750,000 triangles, watertight and consistently wound, with a longest dimension of exactly 60 mm. The original 1,174,292 triangles were reduced for export. GLB and the inspection report were saved in the mesh library. Printability is not certified.
- Ran the fixed setup as an application-only repair/upgrade using the built 0.10.1 payload. The native app restarted on 0.10.1 with the same 8B model, saved voice identity, speech provider and mesh library. Private message count remained zero. Internet/file permissions remained OFF; the requested creative, mesh and voice capabilities remained enabled. An existing personal-memory dataset was not available, so this is not a claim of populated-memory upgrade acceptance.

## Automated and packaged checks

- 115 existing service-independent Node tests passed on this machine.
- Six authenticated HTTP acceptance scripts passed: development/MCP, memory, persistent tasks, voice, images and 3D. Inference in these scripts is fixture-based.
- Seven Python 3D installer tests passed.
- Two new Windows installer regressions passed, covering download failure/cancellation and hidden-process pipes/nonzero exits.
- Rebuilt 0.10.1 desktop payload self-test and all 49 packaged installer checks passed.

## Remaining acceptance

Clean-OS WebView2 installation, uninstall/reinstall data preservation, populated-memory upgrade acceptance, interrupted upgrades, signing, CPU/AMD generation and other unexercised models remain open. This session does not complete the full brief or certify arbitrary generated meshes as printable.

The installation findings took priority over DOC-01 after the user requested installation and testing on this computer. Document-reading dependency exploration was not retained as a product change; DOC-01 remains the next ready feature when installation acceptance is finished.
