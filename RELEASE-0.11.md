# Dyanari 0.11 — grounded research and main-chat workflows

Main chat reads supplied HTTPS sources before answering and runs background Google research for explicit research requests. Dated source excerpts are retained in a model-independent notebook unless private or retention is disabled. Later image prompts can reuse supported appearance details. Failed reads stop the answer instead of allowing an invented researched briefing. Search redirects are resolved in the isolated desktop browser; source redirects are checked at every hop. Research retries a shorter topic when initial sources fail. See [research](RESEARCH.md).

Real desktop acceptance read the Iron Warriors Lexicanum article and a Warhammer Community article through Google. With an earlier incorrect answer in history, actual Qwen3 8B correctly answered the Legion, Primarch, homeworld and colours and cited Lexicanum in 8.6 seconds. This validates that scenario, not universal accuracy. Blocked sites and human verification remain limitations.

Existing feature panels open alongside the main conversation. Setup, grants and approvals remain user-controlled. One real main-chat request generated a Qwen image and passed it to TripoSG. Save As supports STL, OBJ, PLY and GLB. Independent inspection verified STL/OBJ/PLY face counts, dimensions and watertightness on the generated model. Watertightness does not certify print readiness. See [capability audit](CHAT-CAPABILITIES.md).

British Velvet uses the saved identity with main-chat mute and Stop Voice. Short sentences are synthesized during text streaming, with one clip prepared ahead. Optional NVIDIA dependencies are separate from the CPU environment. Actual saved-voice synthesis on RTX 4080 SUPER measured 5.048 seconds cold and 0.912 seconds warm for a short phrase. Text generation, startup, sentence length and GPU contention add latency; these are synthesis measurements, not guaranteed time to audible chat speech.

PDF, DOCX and XLSX reading adds bounded cancellable extraction with page/paragraph/sheet/cell references and checksum-linked continuation. PDF is text-only; XLSX returns stored formula results without calculation. Nine tests, HTTP acceptance, extracted-payload smoke checks and actual Qwen3 8B spreadsheet reading passed. See [document limits](DOCUMENTS.md).

This is an unsigned Windows preview. Clean-OS installation, physical microphone/output acceptance, all optional model families and full Codex/Claude capability parity remain outstanding. Canonical memory and saved identities are preserved.
