# Dyanari 0.10.0 — local Modly 3D Studio

Images and prompts can now become real local STL and GLB files through pinned official Modly TripoSG, Hunyuan3D Mini Turbo and Trellis.2 GGUF adapters. Input supports uploads, saved Dyanari artwork and approved workspace files; prompts first produce a local Qwen reference image. The app and chat share generation, physical-size validation, saved provenance, mesh inspection, authenticated downloads and a local interactive 3D preview.

Optional installer and in-app setup provide complete pinned weight bundles and separate frozen Python environments, including matched CUDA extensions. All model terms/3D capabilities default OFF. Hunyuan's published grant excludes the UK, EU and South Korea: the backend requires explicit eligibility/separate rights and has not been activated or inference-tested on this UK machine. Trellis's DINOv3 encoder has separate terms. See [the 3D guide](MODLY.md).

Stop/revocation terminate only owned process trees; failed or partial outputs are never registered as successful meshes. Meshes/references persist as tool effects, while private chat messages remain omitted. Memory and voice identities remain independent of the selected model.

Verification: 125 Node application tests, seven Python installer regressions and four local-service tests (136 total), plus authenticated HTTP acceptance. A real prompt → Qwen Q4 → TripoSG run produced a watertight 750,000-triangle STL at 60 mm in 270 seconds. Real Trellis Q4 produced a 749,999-triangle STL at 60 mm in 230 seconds, correctly flagged as non-watertight. Actual scene-transform/scale/build-plane checks, Windows process/setup exclusion, local WebGL preview and repeated frozen install/repair passed. Final packaged checks/hashes are in `BUILD-INFO.json`.

Generated meshes still need slicer inspection/repair; STL creation is not printability certification. Higher Trellis tiers, Hunyuan inference, CPU/AMD and clean-machine installation remain unverified. The Windows installer remains an unsigned preview and the full brief is unfinished.
