# Dyanari work tracker

This is the shared checklist for Astra, Codex and future maintainers. Read [AGENTS.md](AGENTS.md) and [DEVELOPMENT.md](DEVELOPMENT.md) before continuing. Check an item only after its acceptance conditions are met; add the release/PR and test evidence. A partial feature is not a completed milestone. Never interpret this file as permission to access unrelated accounts, files or applications.

## Next work, in order

- [x] **CREATIVE-03 · Qwen Image 2.1 and optional inspiration.** Hardware-selected complete bundles, pinned isolated ComfyUI/GGUF runtime, requested chat images, actual PNG delivery, theme-only local-model decisions, quiet hours, quotas and persistent Stop pause. Evidence: 17 image unit tests, image/chat HTTP acceptance, actual Q2/Q4 512×512/25-step renders and Qwen3 4B decision → real Q4 artwork → consumed quota without chat-memory capture; [0.9](RELEASE-0.9.md). Higher tiers, CPU/AMD rendering and clean-machine installation remain unverified.

- [x] **VOICE-04 · VoiceStudio integration and Dyanari voice.** Pinned separate local backend/full studio, optional setup, saved British adult female design, real TTS, reviewed Whisper base transcription, lifecycle and permission controls. Evidence: 11 unit tests, voice HTTP acceptance, actual source/runtime/model installation, real speech + ASR and identical saved identity after service restart; [0.8](RELEASE-0.8.md). Optional advanced jobs/engines and GPU acceleration remain unverified.

- [x] **AGT-01 · Persistent project tasks.** Original request/workspace, real step results, approval continuation, required verification, Stop/revocation and restart recovery implemented. Evidence: 14 task tests, project-task HTTP acceptance and an actual Qwen3 4B Instruct → approval → real command → automatic continuation flow; [0.7](RELEASE-0.7.md). Finished remains a model-turn status, not proof of all requested behavior.
- [ ] **REL-01 · Clean-machine installation acceptance.** Install in a fresh supported Windows x64 VM: Ollama/WebView2/Git/GitHub CLI/npm, selected HF model download/import and first real response; repair/upgrade/uninstall with memory preservation. Record OS/build and exact artifacts. Needs a clean VM; existing staging/self-tests do not complete this item.
- [ ] **DOC-01 · Structured document reading.** Read PDF, DOCX and XLSX locally within approved workspaces, with bounded results and no macro/embedded-code execution. Acceptance: representative documents, malformed/oversized input, namespace/path/permission tests and exact packaged dependencies.
- [ ] **DOC-02 · Structured document editing.** Edit DOCX paragraphs and XLSX cells while preserving unaffected formatting/formulas; previews, backups and conflict-safe recovery. Acceptance: round-trip files opened by independent readers and visual checks where relevant. PDF editing is a separate task.
- [ ] **VOICE-01 · Reliable push-to-talk and device selection.** Add explicit microphone/output selection, permission revocation and real audio acceptance. Windows speech and VoiceStudio speech/uploaded-WAV recognition work; microphone use remains unverified. Never capture audio just because tests run.
- [ ] **VOICE-02 · Better local voice/recognition.** VoiceStudio OmniVoice and Whisper base are now integrated with pinned optional downloads and a Windows fallback (VOICE-04). Remaining: measured GPU voice acceleration/coexistence, device-based live recognition, and any additional voice engines.
- [ ] **WEB-01 · Scoped browser automation.** Real navigation, inspection and approved interactions, with Internet OFF enforcement for app-managed networking, origin controls and clear external-action approvals.
- [ ] **REL-02 · Signed installer and verified updater.** Signing needs an authorised signing identity. Add version/checksum verification, rollback and memory-preserving upgrade tests. Never bypass SmartScreen or invent a certificate.

## Verified foundations

- [x] **CORE-01 · Dedicated local Windows executable.** Self-contained native shell, embedded Node/backend/action helper, loopback auth and optional-service degradation. Evidence: desktop payload self-test; [0.3](RELEASE-0.3.md).
- [x] **CORE-02 · Hardware-aware bootstrap installer.** RAM/NVIDIA VRAM recommendations, pinned HF GGUF artifacts, official dependencies, per-user install and memory-preserving uninstall. Evidence: 11 packaged checks and isolated staging; [installer details](INSTALLER.md). Clean-machine acceptance remains REL-01.
- [x] **CORE-03 · Model-independent canonical memory.** Same SQLite facts/history/personality across model changes and restarts, fixed embedding model and keyword fallback. Evidence: real Qwen3 4B Instruct / Qwen3-VL 2B recall and restart tests; [0.6](RELEASE-0.6.md).
- [x] **MEM-01 · Memory review and consolidation.** Categories/provenance, optional reviewed suggestions, project boundaries, guarded correction, consolidation/undo, deletion lineage cleanup and metadata-aware backups. Evidence: 14 memory tests, memory HTTP acceptance and native UI inspection; [0.6](RELEASE-0.6.md).
- [x] **FILE-01 · Scoped text/code and file organisation.** Read/search/create/edit/copy/move, permission controls, stale-file protection, delete previews and recovery. Evidence: file and integration tests; [0.2](RELEASE-0.2.md).
- [x] **DEV-01 · Git/GitHub workflows.** Status/diff/log, clone/branch/explicit commit, fast-forward pull, non-force push, issues/comments/PRs with exact write previews. Evidence: real branch/commit/push/PR [#1](https://github.com/MrKrisSatan/Dyanari/pull/1); [0.4](RELEASE-0.4.md).
- [x] **DEV-02 · Build/test recipes.** Approved Node/npm/dotnet/Python argv recipes, actual exit codes/logs, limits, timeouts and Windows process-tree cancellation. Evidence: real .NET successful/failed compilation, cloned-project tests and 11 development tests; [0.4](RELEASE-0.4.md).
- [x] **MCP-01 · Linked local MCP projects.** Stdio connections, pagination/schema discovery, tool grants and approved calls. Pinned REA install tested with 229 tools and two-file static JavaScript analysis. Evidence: nine fixture tests and HTTP acceptance; [0.5](RELEASE-0.5.md). Other transports/providers remain pending.
- [x] **WIN-01 · Initial Windows actions.** Approved Notepad/Calculator workflows and native UIA fixture, including real Calculator 17+25=42 and Notepad readback. Evidence: [0.3](RELEASE-0.3.md). This does not mean arbitrary desktop control is finished.
- [x] **OPT-01 · Initial optional services.** Local speech synthesis, image inspection, one-shot screen-capture bridge, reminders and ComfyUI text-to-image wiring. Evidence: service tests and real image generation; [0.2](RELEASE-0.2.md). Portable setup/live microphone/general screen acceptance are separate work.
- [x] **CI-01 · GitHub Windows source checks.** Service-independent tests plus development/MCP and memory HTTP acceptance. Evidence: [.github/workflows/checks.yml](.github/workflows/checks.yml), green PR checks for releases 0.4–0.6.
- [x] **SEC-02 · Revocation with stale paths.** Permission switches remain usable after a configured workspace moves/disappears; ordinary settings changes cannot silently follow a replacement junction into a newly granted folder. Evidence: owned missing-folder/junction fixtures in `agent-tasks.test.mjs`; [0.7](RELEASE-0.7.md).

## Remaining full-brief work

- [ ] **AGT-02 · Longer task planning and review.** Coordinated multi-host task ownership, editable plans/checkpoints, richer success criteria, recoverable exploratory errors, task history paging/export and backup, and measured context budgeting for small models. Keep actual verification separate from model claims.
- [ ] **CORE-04 · Additional local inference endpoints.** User-configured compatible loopback endpoints, readiness/capability checks and model-independent context. No accidental cloud fallback.
- [ ] **CORE-05 · Wider model catalog.** Verified 14B/larger alternatives for suitable hardware, download resume, benchmarks for tool use and post-install inference acceptance. Community “abliterated” is not a quality guarantee.
- [ ] **CORE-06 · Broader resource scheduling.** Cross-profile GPU coordination, low-memory admission and measured coexistence of chat/vision/creative/voice jobs.
- [ ] **MEM-02 · Deeper optional extraction.** Local-model semantic/episodic suggestions, contradictions and temporal corrections, still reviewed and private-mode safe. Current rules are intentionally limited.
- [ ] **MEM-03 · Large-history management.** Paging, retention controls, very large backups and measured long-session retrieval. Address global exact-content uniqueness without losing legacy records.
- [ ] **PERSONA-01 · Rich character editor.** Dedicated biography/style/relationship/lore/boundary fields and robust character-sheet import. Never invent permanent user canon.
- [ ] **VOICE-03 · Hands-free and wake phrase.** Explicit opt-in, indicators, interruption, wake-word testing and reliable Stop. Cloning only from authorised samples, as a separate option.
- [ ] **WIN-02 · More approved applications.** Real keyboard/mouse/UIA workflows, identity checks, changed-state previews and recovery. Avoid treating screenshots as authority.
- [ ] **DEV-03 · Git usability.** Linked worktrees, selected deletion commits, conflict-resolution previews, issue/repository pagination and PR merge/check workflows. No automatic destructive Git operations.
- [ ] **DEV-04 · Dependency and SDK setup.** Explicit optional development-environment installation, per-project environments and reproducible source bootstrap.
- [ ] **MCP-02 · Additional MCP transports/providers.** Authenticated loopback HTTP/SSE, schema bounds and real provider acceptance. REA native providers are not yet installed/validated.
- [ ] **DOC-03 · Broader formats.** PDF annotation/editing, presentations, images and structured exports with validation and recovery.
- [ ] **WEB-02 · Research/download management.** Search-provider selection, evidence/source records, approved downloads and durable research tasks.
- [x] **CREATIVE-01 · Portable creative setup.** Separate frozen Python/CPU-or-CUDA environment, pinned ComfyUI/GGUF and optional complete Qwen bundles, independent of Forge packages. Actual isolated setup and GPU rendering passed; [guide](QWEN-IMAGE.md). Fresh-machine acceptance remains REL-01.
- [ ] **CREATIVE-02 · Advanced creative workflows.** Image editing/inpainting, animation, assets for games, music/audio workflows and bounded GPU scheduling.
- [ ] **AVATAR-01 · Character appearance.** Editable local avatar and speech-reactive animation, without substituting visuals for working capabilities.
- [ ] **PROACTIVE-01 · Stronger scheduling.** Durable task/reminder execution, missed-run handling and optional background service, all opt-in with quiet hours and visible cancellation.
- [ ] **MOBILE-01 · Android access.** Authenticated encrypted transport, device approval/revocation and restricted remote tools. Do not expose the current loopback API publicly.
- [ ] **SEC-01 · Adversarial/long-session acceptance.** Prompt-injection, symlink/race, stale approvals, credential leakage, interrupted upgrades and resource-pressure cases. Existing checks are a foundation, not universal proof.
- [ ] **REL-03 · Cross-platform planning.** Explicitly decide whether Linux/macOS/ARM64 are in scope; Windows-specific APIs need real replacements. Do not label this build universal.
- [ ] **REL-04 · Full release checklist.** All outstanding brief requirements completed and accepted, remaining caveats recorded, signing/updating/device support validated. The full brief is not complete yet.

## Latest handoff

0.9 adds Qwen image setup, CREATIVE-01/03, bounded optional image inspiration and a fuller British voice identity (the previous whisper voice remains). Continue with REL-01 if a clean supported Windows VM is available; otherwise DOC-01 is the next ready engineering milestone. Do not reimplement the checked foundations. Update this handoff and evidence when finishing another release.

## Original brief phase map

| Phase | Current position | Remaining checklist areas |
|---|---|---|
| 1 · Local AI | Native chat and local inference work; HF setup catalog exists | REL-01, CORE-04/05/06 |
| 2 · Identity/memory | Persistent identity, retrieval and reviewed consolidation work | PERSONA-01, MEM-02/03 |
| 3 · Internet/files | Scoped text/file tools and GitHub work; browser/structured formats incomplete | WEB-01/02, DOC-01/02/03 |
| 4 · Voice | Windows fallback, VoiceStudio speech/uploaded-WAV ASR and revised saved British voice | VOICE-01/02/03 |
| 5 · Control/vision | Limited approved native workflows and local image inspection | WIN-02, SEC-01, wider device acceptance |
| 6 · Creative | Isolated Qwen runtime, actual requested/spontaneous renders and project tools | CREATIVE-02, CORE-06 |
| 7 · Advanced/release | Public tested previews, tracker and task orchestration | AGT-02, AVATAR-01, PROACTIVE-01, MOBILE-01, REL-01/02/03/04 |

These are partial phase summaries, not phase-completion checkmarks. Private user project names, relationship canon and character sheets are intentionally not copied into this public tracker.

## Definition of done for each release

1. Implement a concrete checklist item; retain existing memory and permissions.
2. Run relevant tests and acceptance; distinguish real execution, fixtures and unverified cases.
3. Update this checklist, release notes and BUILD-INFO.json with evidence.
4. Build/self-test desktop and installer. Publish only source and release assets, never user data/models/credentials.
5. Push a feature branch, open a PR, wait for green Windows checks, merge, publish a preview release and verify public asset size/hash/download.
6. Leave a concise handoff with the next unchecked ready task. Do not check off unrelated work or clean-machine testing that did not happen.
