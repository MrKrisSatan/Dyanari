# Dyanari Windows installer

Run `DyanariSetup-0.7.0.exe` from the outputs folder. This is a per-user Windows x64 bootstrap installer, requiring Windows 10 build 19041 or newer, internet for dependencies, and at least 8 GB RAM for the smallest useful model. It does not require separately installed Node.js or .NET. Linux, macOS and ARM64 are not supported by this build. The installer is unsigned.

Setup detects physical RAM and NVIDIA VRAM, selects a conservative Q4_K_M model, shows download sizes, and lets you select another model or install the application only. Non-NVIDIA systems use the smallest recommendation and Ollama's CPU fallback; AMD/Intel GPU acceleration has not been validated. Hardware recommendations are estimates at 4096 context, not performance guarantees.

| Recommendation | RAM | NVIDIA VRAM | Model download |
|---|---:|---:|---:|
| Qwen3 1.7B Abliterated | 8 GB | CPU or any | 1.03 GiB |
| Qwen3 4B Instruct Abliterated | 12 GB | 6 GB | 2.33 GiB |
| Qwen3 8B Abliterated | 24 GB | 12 GB | 4.68 GiB |

This machine's 16 GB RAM and RTX 3060 8 GB select the 4B Instruct model. Below 8 GB RAM, use application-only setup and a remote-free local runtime of your own; the listed models are not recommended.

Pinned Hugging Face sources (review model cards and their licenses):

- [1.7B: mradermacher/Qwen3-1.7B-abliterated-GGUF](https://huggingface.co/mradermacher/Qwen3-1.7B-abliterated-GGUF)
- [4B Instruct: tinyopsec/Qwen3-4B-Instruct-2507-abliterated-GGUF](https://huggingface.co/tinyopsec/Qwen3-4B-Instruct-2507-abliterated-GGUF)
- [8B: bartowski/mlabonne_Qwen3-8B-abliterated-GGUF](https://huggingface.co/bartowski/mlabonne_Qwen3-8B-abliterated-GGUF)

Community descriptions of “abliterated” or “uncensored” do not guarantee particular behavior or tool competence. The 1.7B and 8B models may generate reasoning text. GGUF files are imported using [Ollama's documented Modelfile workflow](https://docs.ollama.com/import); setup does not execute model repository scripts. Revisions, exact byte counts and SHA-256 values are in `installer/models.json`, verified against Hugging Face's API on 2 November 2026.

Setup downloads the official Ollama v0.40.13 Windows x64 archive (1.49 GiB) and checks its release SHA-256. It installs Microsoft's official WebView2 Evergreen bootstrapper only when the runtime is missing, after validating its Microsoft Authenticode signature. WebView2 is a shared dependency and remains installed after uninstalling Dyanari. Setup requires several additional GiB for extraction and model import. Cancelled downloads are restarted on retry; complete verified downloads are reused.

Application: `%LOCALAPPDATA%\Programs\Dyanari`.

Shared memory, chat, settings and models: `%LOCALAPPDATA%\Dyanari\data`. Installed Dyanari starts its own loopback Ollama process on a free port and closes that process with the app. It does not use or modify an unrelated Ollama server. A new profile uses the selected model; an existing profile preserves its selected model. Choose a newly installed model from Dyanari's Models page. Switching models never changes the database path.

An existing portable build continues using its existing `data` folder. Setup does not silently merge portable and installed profiles. Use Dyanari's encrypted backup and restore to transfer portable memory into an installed profile. Close both applications before migration.

Run setup again to repair the app or add a different catalog model. Uninstall through Windows Installed apps. The uninstaller removes the executable, runtime and Start menu shortcut, preserving memory, models and download cache. Setup does not yet install optional ComfyUI, creative checkpoints, neural voice, vision or embedding models; memory uses keyword retrieval when embeddings are unavailable. It does not install an updater or sign releases.

Build: first `build-desktop.ps1 -Dotnet <SDK10 path>`, then `build-installer.ps1 -Dotnet <SDK10 path>`. Close a running portable executable before replacing it; the installer embeds the fresh `desktop/publish/Dyanari.exe` build.

Validation: `DyanariSetup-0.7.0.exe --self-test` extracts the actual packaged payload and checks hardware tiers, all three model records, archive traversal rejection, corrupt-hash rejection and embedded executable presence. It writes `installer-self-test.json` beside the installer. This is not a substitute for a clean-machine installation test. Diagnostic log: `%LOCALAPPDATA%\Dyanari\setup-last.log`.

Verified in this build: all 43 existing application tests, desktop payload extraction, 11 packaged installer checks, and an isolated application-only staging install that verified/extracted the real Ollama archive, copied the app and wrote installation configuration. The staged Ollama executable reported version 0.40.13. Model downloads/imports, WebView2 installation, shortcut/uninstall registration and first launch on a fresh Windows machine still need end-to-end acceptance testing. Staging deliberately skips system registration, shared dependency installation and app launch.


Version 0.4.0 additionally downloads hash-verified MinGit 2.56.0.4 (about 38 MiB) and GitHub CLI 2.103.3 (about 14.5 MiB), adds a Connect GitHub Start menu shortcut and includes the Development page. See [RELEASE-0.4.md](RELEASE-0.4.md). These tools use their vendor credentials and are not installed globally. Existing shared memory is preserved.


Version 0.5.0 adds linked local MCP projects and an official Node 24.22.1 distribution with npm (36 MiB archive, pinned SHA-256) under runtime/node. REA is an optional, separately approved package installation. See [RELEASE-0.5.md](RELEASE-0.5.md).


Version 0.6.0 adds additive memory metadata, optional reviewable suggestions, reversible consolidation and encrypted metadata backups. Existing memory ids, facts and scopes are preserved; no memory table is rebuilt. See [RELEASE-0.6.md](RELEASE-0.6.md).


Version 0.7.0 adds persistent project tasks and an evidence-backed TODO/agent handoff. Existing memory and chat remain model-independent; no project task resumes automatically after restart. See [RELEASE-0.7.md](RELEASE-0.7.md).
