# Dyanari implementation report

**Historical 0.1 report.** The current executable and expanded functionality are documented in [RELEASE-0.2.md](RELEASE-0.2.md), dated 2 November 2026. Its verification/status statements supersede this initial report.

Tested on this computer on 1 November 2026. This is a working initial local release, **not completion of the entire seven-phase brief**.

## Passed

- Eleven automated backend/service tests: default access denial; workspace scope; separate editing permission; read-only denial; atomic edits; stale-hash conflicts; revision rollback; create permission; unsupported binary and credential protection; rejection of unavailable tools; settings unaffected by instructions in a read file; active task cancellation; identity/memory persistence; duplicate prevention; private-network/HTTPS/domain controls; real semantic retrieval with project isolation; local British female WAV synthesis. Some tests cover multiple assertions.
- Real end-to-end integration against Ollama **qwen3:4b-instruct**: model called read_file, edit_file and read_file to replace “forty one” with “forty two” in a disposable text file. Disk contents were asserted after the model finished. No real user project was edited.
- Real HTTPS webpage retrieval from example.com when enabled, and rejection when internet was disabled.
- API authentication and foreign-origin rejection.
- Private model conversation left no stored chat messages.
- Password-encrypted backup and authenticated restoration; restored permissions were OFF.
- Semantic memory: “What hot beverage do I like?” retrieved “I enjoy drinking Earl Grey tea” using local all-minilm vectors. Fantasy lore was excluded from other project contexts.
- Windows speech synthesis produced valid RIFF/WAVE audio using an installed British female voice. An en-GB recognition engine is installed; live microphone input has **not** been tested.
- Browser interface loaded with backend-reported internet/file switches OFF and local inference connected. A real local introduction streamed into the conversation view.
- Ollama reports qwen3:4b-instruct Q4_K_M, 4096 context, approximately **3.18 GB model allocation, all in GPU memory**. NVIDIA logs confirm the RTX 3060 CUDA backend. This is an allocation check, not a sustained performance benchmark.

## Implementation choices

Portable Ollama, bundled Node 24, SQLite, a loopback HTTP backend and an Edge app window. No paid API, cloud login, telemetry integration, public listener, firewall rule or automatic startup task was added. Runtime/model downloads occurred during setup. Application internet/file switches default OFF and do not control unrelated programs.

The ordinary qwen3:4b tag resolved to a thinking-only model and generated long reasoning passages even with think:false. Its first edit acceptance test failed. Switching to the official 4b-instruct variant fixed the observed conversation/tool compatibility issue; the real edit test then passed repeatedly. The standard instruct model is **not abliterated**. Both downloaded model variants remain on disk.

TLS uses Windows system CAs; certificate verification was not disabled. DNS targets are validated and pinned to public IPv4 addresses. Redirects are rejected. Web search is a public HTML request and can be blocked or change; it is less robust than a dedicated search service. No general-purpose browser automation is supplied.

## Partial / unfinished

| Area | Status |
|---|---|
| Local streaming conversation, identity | Working |
| SQLite and semantic memory | Working; explicit fact capture, no inferred consolidation |
| Internet/file permission switches | Working at application/tool layer |
| Agentic text-file edits and rollback | Working; no arbitrary shell, deletion or broad organisation tools |
| Voice output | Local synthesis tested; controls added |
| Voice input | Local adapter and UI present; live microphone unverified |
| Structured documents/images | No format-aware tools yet |
| Screen vision / Windows control | Not implemented |
| ComfyUI / image generation | Not installed or integrated |
| Proactive reminders / wake word | Not implemented |
| Avatar | Static identity orb with speech playback animation |
| Android / secure remote access | Not implemented; loopback only |
| Tauri/native installer | Not built; documented Windows launcher provided |
| Full adversarial prompt-injection evaluation | Not completed; tool permissions are enforced independently |

## Practical limits

This small model can still choose incorrect tools or edits. Code enforces capability and workspace boundaries, but those controls do not prove a requested edit is logically correct. Existing text writes have backups and conflict detection. No tests are run against edited source automatically because shell execution is not implemented. Review changes before using them in a real project.

Local chat/memory databases, file backups and audit logs are stored unencrypted on disk; exported backups are encrypted. Audit logs include tool arguments and may include file content. Private mode suppresses conversation and explicit memory storage, not tool auditing. Internet queries and fetched URLs are external requests; the app is not a general data-loss-prevention system. Protect the installation with normal Windows account and disk protections.

The permission tests verify specific enforced invariants. Reading hostile instructions did not alter settings; this is not a claim that every possible prompt injection is defeated. No unrestricted shell or computer-control tool is exposed.

## Reproduce

From this folder, with Ollama running:

```
runtime\node.exe --test test.mjs optional-services.test.mjs
runtime\node.exe integration.mjs
```

Tests create isolated `.dyanari-test-*` directories. Source milestones are committed in the local Git repository; data and runtime binaries are intentionally excluded.
