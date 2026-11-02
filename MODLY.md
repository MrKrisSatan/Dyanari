# Local 3D Studio

Based on **[Modly](https://github.com/lightningpixel/modly) by [Lightning Pixel](https://github.com/lightningpixel)**. Dyanari hosts its pinned official generator extensions as private one-shot workers, and uses Modly's scene-flattening export helper. No Electron app, public Modly HTTP server, cloud generation account or Tripo API key is required. This integrates the requested geometry workflow; Modly's separate node editor, scene editor and texture workflows are not embedded.

## Use

1. Optionally select a 3D backend during installation, or open **Voice & creative studio → 3D Studio** and refresh the models.
2. Enable **Creative Studio** and **3D Studio**. New installations and backup restores leave both OFF. Existing text models, memory, voice identities and image models are preserved.
3. Review the selected model/auxiliary terms, enable Internet Access for setup and install it. Hunyuan requires an additional eligibility declaration. You can turn Internet Access OFF after setup.
4. Choose an uploaded PNG/JPEG/WebP (up to 20 MB / 20 megapixels), a saved artwork id, an approved readable workspace image, or a text prompt. Text uses the installed local Qwen Image 2.1 bundle to make a reference image before generating geometry. File paths require Tools & File Access, Read and an approved workspace; uploads/artworks do not grant arbitrary file access.
5. Choose a backend, quality and **longest dimension in millimetres** (1–1000; default 50). Generate, preview by dragging/zooming, and download STL or GLB. Chat exposes `generate_stl` and `list_3d_models` with the same permissions and validation.

The library records backend, prompt/reference provenance, real files, triangle count, physical extents, winding and watertightness. **An STL export is not a printability certificate.** AI meshes can have open surfaces, thin walls, disconnected components or unsuitable geometry. Inspect/repair and slice before printing. STL has no textures or reliable embedded units; interpret Dyanari's STL coordinates as mm. GLB preserves the generator's original scene/scale; the STL is separately rotated from Y-up to Z-up, uniformly scaled and placed on the build plane.

Meshes exceeding one million triangles are reduced toward 750,000 triangles for bounded STL export. The report records original/final counts and whether reduction occurred; the original GLB is retained. Reduction can change fine detail and take several minutes on dense meshes. Invalid, non-finite or still-oversized results fail instead of entering the library.

## Models and hardware guidance

| Backend | Weights, approximate decimal GB | RAM / NVIDIA VRAM guidance |
|---|---:|---:|
| TripoSG | 7.95 | 16 / 8 GB |
| Hunyuan3D 2 Mini Turbo | 4.23 | 16 / 6 GB |
| Trellis.2 GGUF Q4_K_M | 4.68 | 24 / 8 GB |
| Trellis.2 GGUF Q5_K_M | 5.15 | 24 / 10 GB |
| Trellis.2 GGUF Q6_K | 5.66 | 24 / 12 GB |
| Trellis.2 GGUF Q8_0 | 6.59 | 24 / 16 GB |

Allow additional disk space for Python/CUDA packages, sources, a shared 176 MB U2Net background remover and generated meshes. Tripo is the default recommendation at 16 GB RAM / 8 GB VRAM; there is no automatic Hunyuan territorial assumption. Trellis includes the vision encoder, sparse decoder, shape decoder and all selected geometry GGUF/config files, including 512 and 1024 shape stages. These minima are guidance, not guarantees for every GPU/resolution. This managed preview targets **Windows x64 with NVIDIA CUDA**. CPU, AMD, other platforms, larger quantizations and every GPU architecture are not validated.

## Licences

- Modly is MIT; its attribution and full notice are included in `THIRD-PARTY-MODLY.txt`. The Modly source and official extension repository revisions are in `modly-catalog.json`.
- [TripoSG](https://github.com/VAST-AI-Research/TripoSG/blob/fc5c40990181e2a756c4e0b1c2f4d6b5202faf8c/LICENSE) is MIT. Its DINOv2 encoder and dependencies retain their upstream notices.
- [Hunyuan3D Mini's published Community License](https://huggingface.co/tencent/Hunyuan3D-2mini/blob/f90a0f7df7d5e6f71109cf333f6a95a0ae3194a6/LICENSE) excludes the **UK, EU and South Korea**. Do not activate it there without separately obtained rights. The bridge is included, but territorial eligibility or separate rights have not been confirmed on this setup, so Hunyuan has not been activated or inference-tested.
- [Trellis.2](https://github.com/microsoft/TRELLIS.2) and its [GGUF conversion](https://huggingface.co/Aero-Ex/Trellis2-GGUF) retain their model/component terms. In particular, the **[DINOv3 licence](https://github.com/facebookresearch/dinov3/blob/main/LICENSE.md)** applies to the vision encoder; the bundle must not be described as entirely MIT. Review those terms before setup.
- U2Net/rembg, PyTorch, geometry libraries and CUDA extensions retain their respective licences. The workers force the provisioned CPU U2Net session; they do not silently download rembg's newer Bria default.

Public installers do not pre-accept any model terms, enable 3D generation, bundle weights or publish user meshes. The private local model markers record the selected bundle's consent; Hunyuan markers also require territorial eligibility/separate rights.

## Runtime and recovery

Default runtime: `%USERPROFILE%\.dyanari\modly`. `DYANARI_MODLY_HOME` may specify another absolute directory. Each backend's weights remain in `models/<bundle>`. Tripo/Hunyuan use the frozen `shape` environment; Trellis uses its own frozen `trellis` environment because the transformer versions differ. Neither alters Forge, ComfyUI, VoiceStudio or global Python packages.

`setup-modly.ps1 -BundleId tripo -AcceptModelTerms` installs the pinned bundle. Hunyuan additionally requires `-HunyuanTerritoryEligible`; this flag must reflect actual eligibility or separate rights. `-RuntimeRoot` and `-Cache` are optional. The script uses verified uv 0.13.6, managed CPython 3.11.13, frozen lockfiles and Torch 2.9.1/CUDA 12.8. Source ZIPs, native wheels and HF files have exact SHA-256/size pins. Completed files are checked/reused; partial downloads are not promoted. Mutable upstream wheel-release URLs fail closed if their pinned bytes change. Setup never falls back to installing/building arbitrary latest dependencies.

Stop kills only the owned worker/setup process tree. Permission revocation and Stop all also cancel it; Internet OFF cancels setup but permits already-provisioned offline inference. Work is never replayed automatically after restart. Failed/interrupted jobs remain unregistered diagnostic folders, with no successful library entry. Successful library records/assets are additive and do not depend on the conversation model. Mesh/reference files are tool effects and remain saved even for private chat; private chat messages/memory are still omitted. The conversation backup does not embed large artwork/mesh/model folders; back those up separately.

GPU work uses Dyanari's resource lease. Conversation models and the owned Qwen service release memory before 3D inference; idle owned VoiceStudio is suspended and restored after a successful job, not after Stop. Active speech blocks the 3D operation. External/user-owned processes are not terminated.

Inference sets Hugging Face offline flags, disables telemetry and blocks Python socket connections/download helpers. This is application-level offline enforcement, **not an OS sandbox** for native libraries or a general firewall. Generators/native code run with the Windows user's permissions.

## Verification

`modly.test.mjs` checks input bounds, complete pinned bundles, permissions, consent/territory/hardware checks, mutex, honest output registration, workspace access, prompt provenance, cancellation/revocation and voice lifecycle. `modly-http-integration.mjs` uses a disposable stdlib Python worker and sparse placeholder weights to test the authenticated app/API, real process cancellation, downloads, chat tool continuation, private-message omission and permission reset on restore. It does **not** claim model inference.

Actual local TripoSG setup and GPU inference separately produced a 457,924-triangle STL at exactly 50 mm longest dimension plus a GLB, with non-watertight geometry correctly reported. See release notes and `BUILD-INFO.json` for final runtime/real-flow evidence and limits. Clean-machine acceptance remains open; fixture and workstation tests do not complete it.

Final 0.10 evidence: actual Qwen Q4 prompt → TripoSG DiffDMC → 750,000-triangle watertight 60 mm STL in 270 seconds; actual U2Net → Trellis Q4 → reduced 749,999-triangle 60 mm STL in 230 seconds (not watertight, flagged for repair). Windows OS worker/setup locks and repeated frozen repair passed, including normalization of upstream CUDA wheel metadata. Seven stdlib installer regressions run in CI alongside 125 Node tests; four local-service tests also passed. The source guide does not claim Hunyuan or every GPU is validated.
