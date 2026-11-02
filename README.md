# Dyanari

A local Windows AI companion and practical assistant, powered by Ollama. Conversation and memory stay on your computer, with memory shared across chat models.

## Download

[Download the Windows installer preview](https://github.com/MrKrisSatan/Dyanari/releases/tag/v0.7.0). Select **DyanariSetup-0.7.0.exe** under Assets. Requires Windows x64, Windows 10 build 19041 or newer. This build is unsigned.

Setup detects RAM and NVIDIA VRAM, recommends a Hugging Face abliterated GGUF model, and installs Dyanari, Ollama and WebView2 when needed. Model downloads are optional and checked against pinned revisions, sizes and SHA-256 hashes. Internet is required during setup; inference runs locally afterward.

See [installation instructions](INSTALLER.md) for sizes, shared memory paths and migration from portable builds. Memory and models are preserved on uninstall.

## Continuing development

Start with [TODO.md](TODO.md), [AGENTS.md](AGENTS.md) and [DEVELOPMENT.md](DEVELOPMENT.md). The tracker records completed work with evidence, open acceptance requirements and the next ready task for another Astra/Codex session.

## Capabilities

- Local chat, editable personality and model-independent persistent memory.
- Persistent project tasks that continue after approved operations, retain intent/results and require selected verification.
- Memory categories/sources, reviewable suggestions, related-wording checks and reversible consolidation.
- Linked local MCP projects, including a pinned REA installation, tool discovery and approved calls.
- Scoped text/code file reading, searching, creation, editing and recovery.
- Approved Git branches, commits, clones, fast-forward pulls and non-force pushes.
- GitHub repositories, issues and pull requests, with exact write previews.
- Saved Node/npm/dotnet/Python build and test recipes with real exit codes, bounded logs and process-tree cancellation.
- Offline JavaScript, JSON and Python syntax checks.
- Permission-controlled web fetching, reminders and limited Notepad/Calculator workflows.
- Optional local speech, vision and ComfyUI generation with separately configured dependencies.

Internet, file changes and computer control have separate permissions. Optional services are not all included in the installer.

## Development status

Early preview; the full project brief is not complete. Arbitrary shell commands, general browser/computer automation, automatic conflict repair, structured Office editing and mobile access are not implemented. Approved build/test recipes execute real code with the Windows account permissions and are not sandboxed. Small local models may struggle with complex coding and long tasks. Community “abliterated” descriptions do not guarantee behavior or quality.

Passed: 90 application tests, 19 development/MCP HTTP checks, real GitHub authentication/clone/pull and cloned-project tests, plus 11 packaged installer checks, desktop extraction and an isolated application-only staging install using the verified Ollama archive. Fresh-machine model import, WebView2 installation, shortcut/uninstall registration and first launch still require acceptance testing. See [project tasks and handoff](RELEASE-0.7.md), [memory review](RELEASE-0.6.md), [linked projects and REA](RELEASE-0.5.md), [GitHub and build/test tools](RELEASE-0.4.md), [Windows tools](RELEASE-0.3.md) and [installer details](INSTALLER.md).

## Build

On Windows x64, install .NET 10 SDK and place an official Node.js 24 Windows x64 executable at `runtime/node.exe`. Run:

```powershell
.\build-desktop.ps1 -Dotnet dotnet
.\build-installer.ps1 -Dotnet dotnet
```

The installer embeds the fresh desktop build and writes `DyanariSetup-0.7.0.exe` into the parent directory. Ollama and model files download during setup. Close running copies before replacing outputs.

For source development, `npm start` starts the loopback backend; configure local Ollama separately. `npm test` runs core tests. `npm run test:services` needs optional local services. Read integration-script prerequisites before running them; they perform real operations in isolated test workspaces.

Chat, memory databases, weights, credentials, runtime binaries and caches are excluded from Git. Historical reports describe an optional development-machine configuration, not a portable dependency bundle.
