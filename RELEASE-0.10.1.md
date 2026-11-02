# Dyanari 0.10.1 — second-machine setup fixes

Installation on a second Windows 11 computer exposed problems that staging and mocked tests had not caught:

- Large installer downloads were throttled by polling every network read. The installer now copies asynchronously and polls progress separately, retaining cancellation, size checks, SHA-256 verification and promotion only after verification.
- The hidden Ollama CLI could finish importing a model but remain running without usable console handles. Setup now provides and concurrently drains stdout/stderr pipes, and still checks the exit code.
- VoiceStudio's Bun installer needed the Windows certificate store and failed with its default hardlink backend on this machine. Setup now uses system certificate authorities and the copyfile backend, keeping the upstream frozen lockfile and disabled lifecycle scripts. The pinned Python truststore package provides Windows trust for voice model downloads. Image/voice uv setup also explicitly uses system certificates. TLS verification is never disabled.

Two Windows PowerShell regression tests exercise real local HTTP transfers (success, cache reuse, incorrect size/hash, disconnected stream and cancellation) and hidden CLI output larger than pipe capacity, including a nonzero exit. These are included in CI.

The desktop payload and all 49 packaged installer checks pass. Second-machine runtime acceptance and remaining limitations are recorded in [SECOND-MACHINE-ACCEPTANCE.md](SECOND-MACHINE-ACCEPTANCE.md). The installer is an unsigned preview. Document reading, clean-OS dependency installation, uninstall preservation and the rest of the full application brief are not implied by these fixes.
