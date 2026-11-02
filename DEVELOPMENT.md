# Developer handoff

## Architecture

- `core.mjs`: SQLite, settings/leaf permissions, workspaces and canonical tool dispatch.
- `server.mjs` / `public/`: authenticated loopback HTTP API and WebView2 UI.
- `memory.mjs` / `memory-ledger.mjs`: model-independent retrieval, metadata, reviewed suggestions and guarded consolidation.
- `development.mjs`: Git/GitHub, saved command recipes, execution records and approvals.
- `linked-projects.mjs`: local stdio MCP clients, pinned REA installation and tool approvals.
- `files.mjs`, `scheduler.mjs`, `voice.mjs`, `vision.mjs`, `creative.mjs`, `resources.mjs`: scoped files and optional local services.
- `desktop/`: self-contained .NET 10 WinForms/WebView2 app, embedded Node payload and lifecycle.
- `action-helper/`: self-contained Windows UI Automation helper.
- `installer/`: self-contained bootstrapper and PowerShell wizard. Runtime/model downloads are separate from the installer binary.

Installed app: `%LOCALAPPDATA%\Programs\Dyanari`. Shared data: `%LOCALAPPDATA%\Dyanari\data`. Portable builds use an adjacent writable `data` folder. Back up canonical data before manual experiments. Tests create ignored `.dyanari-test-*` folders; move them to a verified workspace archive when cleanup is needed, never delete arbitrary computed paths.

## Tools and builds

Use Windows x64, .NET 10 SDK and Node.js 24.22.1 or a verified compatible version. Put an official Node executable at `runtime/node.exe` for packaging. Official pinned archive used by setup: `https://nodejs.org/dist/v24.22.1/node-v24.22.1-win-x64.zip`, SHA-256 `d2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5`. Verify before extracting/running it. The original workspace has a local SDK under `work/dotnet`; a fresh clone needs its own installed SDK. Do not commit these runtimes.

```powershell
.\build-desktop.ps1 -Dotnet <path-to-dotnet.exe>
.\build-installer.ps1 -Dotnet <path-to-dotnet.exe>
```

Build scripts currently change the caller's working directory. Use absolute paths or fresh shell calls for subsequent commands. Close a running executable before overwriting it; the installer embeds `desktop/publish/Dyanari.exe`. After a source change, rebuild both before publishing. Run `Dyanari.exe --self-test` and the versioned installer with `--self-test`; read the JSON reports, not just process exit. Update versions consistently in package.json, desktop project/program, server, installer display version, build-installer.ps1, README, installer/release notes and manifest.

## Verification

The GitHub Windows workflow runs service-independent unit tests plus `development-http-integration.mjs` and `memory-http-integration.mjs`. Run changed-feature tests first, then the appropriate regression suite. `npm test` also includes some local-service/voice/Python requirements; read each test before claiming a fresh CI environment can run it. Service tests and real-model integrations need their named local components.

Real integration scripts include file editing, cross-model memory, project checks, Notepad/Calculator, ComfyUI and REA. Keep permission/database/test workspace isolation. Do not reuse an open user application unless it is an explicitly identified disposable fixture. Microphone, clean VM install, REA native providers and remote/mobile access remain unverified unless TODO evidence says otherwise.

## Publishing and tracker maintenance

Keep stable TODO ids. `[x]` means implemented **and** validated against the written acceptance, with evidence linked. Use an unchecked entry and notes for partial/unavailable work. Each release should link its PR, tests and artifacts; correct stale counts/links instead of appending contradictory status text.

Publish a clean source snapshot/normal feature branch, excluding `.git` from other histories, private data, caches, models and runtime binaries. Sanitize developer-specific paths in historical docs. No GitHub token is stored in the repo; use existing authorised credential tools and keep secrets out of output. Public GitHub repository: `https://github.com/MrKrisSatan/Dyanari`.

Wait for passing checks on the exact PR head, merge, point the release tag at the merged source, upload the installer and `.sha256`, compare GitHub's stored size/digest to the local artifact and verify its anonymous download. Mark unsigned builds as previews. Record final URLs and next ready TODO item in the handoff.

VoiceStudio bridge: voicestudio.mjs, voicestudio-launch.py, setup-voicestudio.ps1. Read VOICESTUDIO.md and RELEASE-0.8.md. Source/runtime/model pins live in the optional setup script; setup requires explicit Internet and model terms consent. Managed source/weights are in %USERPROFILE%\.dyanari\voicestudio; profiles are under the actual data directory. Run voicestudio.test.mjs and voicestudio-http-integration.mjs. The real CPU TTS/Whisper/restart check is separate from fixtures. Never infer fresh-machine or microphone acceptance from it.
