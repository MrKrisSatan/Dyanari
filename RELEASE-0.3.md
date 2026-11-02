# Dyanari 0.3 — Windows actions and verified project checks

This release continues the full brief. It does **not** claim the entire brief is complete. Open `Dyanari.exe` as before; existing chats, personality, memories, workspaces and models are preserved. Memory remains shared across chat models and survives restarts.

## New Windows action layer

Use **Computer & checks** in the sidebar. Computer Control and Run Tools default OFF. The Tools & File Access master switch must also be ON.

- **Computer Control** permits scoped inspection and UI changes in supported applications.
- **Run Tools** permits the fixed offline syntax checks and launching supported applications. It does not enable arbitrary shell commands, scripts, terminals, browsers or unlisted executables.
- **Approved applications:** Notepad and Calculator only. The native helper checks process executable locations under protected Windows directories; a similarly named executable in a user folder is not accepted.
- **Window authorisation:** choose **Find approved application windows**, then authorise a specific window. Reading its controls requires this session-scoped authorisation. It does not carry across app restarts. Revocation blocks subsequent inspection/actions.

### Execution modes

| Mode | Behaviour |
|---|---|
| Observe | Inspect authorised windows; computer mutations and app launches are blocked. |
| Assist | Preview a specific action and approve it before execution. Approvals expire after five minutes and are single-use. |
| Autonomous | Only explicitly selected standing workflows can execute without a new prompt. Other UI changes still require fresh approval. |

Standing workflows currently cover opening Notepad, opening Calculator, creating a new workspace note in Notepad, and adding two integers in Calculator. Creating notes additionally requires Create Files and an approved writable workspace; existing files are never overwritten. Calculator sum replaces its display, accepts non-negative integers up to 9999 and verifies the numeric result from the real application's display.

These modes govern the **computer-action layer**. Ordinary project file edits retain their existing independent file permissions and recovery behaviour.

### Native inspection and controls

The `.exe` now embeds a separate self-contained `Dyanari.Actions.exe` helper. It uses Windows UI Automation, not simulated success messages. Window identities include HWND, host/application process IDs and process-start times to detect closed/reused windows, including hosted Windows apps. Inspection is bounded and omits password controls.

Text replacement is available only where the application exposes a writable UI Automation ValuePattern. It checks the previous text hash, performs SetValue and reads the value back. Modern Notepad controls may expose only read-only text patterns; those controls are reported as unsupported rather than using blind keystrokes. The file engine remains the reliable way to edit saved text files.

Button invocation is restricted to a fixed set of local Calculator arithmetic buttons in an arithmetic mode. Arbitrary Notepad menus, AI/network features, application settings and financial/security dialogs are not invokable through this helper. Generic text changes/button invocations always require a new user approval, including in Autonomous mode. The preview is checked again before execution; changed text/window state invalidates approval. A separate desktop resource lock serialises mutations within/across Dyanari instances sharing the same data folder.

Use the existing tool tester or conversational tool loop to request actions such as `calculator_sum`, `open_application`, `inspect_window`, `set_control_text`, `invoke_control` and `create_workspace_note`. A pending action appears in **Computer & checks**; approve or reject it there. Stop all tasks cancels pending approvals and active helper processes. An already-completed UI action cannot be undone merely by cancellation. The helper never closes unrelated user applications.

## Offline project validation

`check_project_file` parses approved JS/MJS/CJS, JSON and Python files without executing source. Run Tools and Read Files must be enabled, and the file must be inside an approved workspace. JavaScript module mode follows `.mjs`/`.cjs` or the project's `package.json`. Node flags and Python's isolated/no-site mode avoid loading project startup code; Python input is explicitly UTF-8. Python uses the optional existing local `runtime/comfy-env` interpreter; JavaScript/JSON need only the bundled Node runtime.

Checks return the source hash, pass/fail status, exit code and bounded diagnostics. They have timeouts/cancellation and do not require Internet Access. These are **syntax checks**, not unit tests, builds, dependency resolution or arbitrary development commands.

The agent now sees only tools allowed by its detailed permissions, reducing prompt overhead for the small model. Failed validation in an explicitly requested repair can trigger bounded continuation; an unresolved check is visibly reported. This does not guarantee the model can solve every error or grant new editing rights. Read-only requests are not converted into repair authorisation. Text search also now accepts individual file paths as well as directories.

## Verification

- **43 automated tests passed**, covering the previous functionality plus modes, explicit session window grants, single-use approvals, standing workflow limits, changed-state rejection, revocation/cancellation, action serialisation, offline non-executing JS/JSON/Python checks, subprocess limits/inherited output pipes, tool exposure, bounded validation feedback and single-file search.
- **Real Windows UI Automation fixture:** replaced text and verified it, rejected a stale hash, invoked a button and verified the fixture's resulting label. The fixture is an owned test window; it does not establish that every application supports writable controls.
- **Real Windows Calculator:** the approval-driven workflow entered `17 + 25` and verified `Display is 42`. The initial attempt exposed a hosted-app detection problem; the helper was corrected to validate both host and application identities before the test passed.
- **Real Notepad:** an approved workflow created a new workspace note, opened it in Notepad and read the exact test text through UI Automation after a session window grant. The test exposed inherited output pipes keeping a completed helper request open; launch redirection and subprocess exit/timeout handling were corrected and regression-tested.
- **Real local coding agent:** read a broken JavaScript module, made an actual file edit and called `check_project_file` to verify valid syntax. The initial attempt stopped at a proposed fix; permission-specific tool exposure and validation feedback were added, and the acceptance test then passed.
- Existing file-edit/network integration and cross-model-memory integration are rerun for this release. Native packaging self-test checks the embedded Node backend and the action helper.

### Reproduce

From this folder, with Ollama running for live model tests:

```
runtime\node.exe --test test.mjs files.test.mjs scheduler.test.mjs creative.test.mjs memory-models.test.mjs actions.test.mjs action-concurrency.test.mjs project-checks.test.mjs validation.test.mjs optional-services.test.mjs vision.test.mjs
runtime\actions\Dyanari.Actions.exe --self-test
runtime\node.exe actions-integration.mjs
runtime\node.exe note-workflow-integration.mjs
runtime\node.exe project-checks-integration.mjs
runtime\node.exe integration.mjs
runtime\node.exe memory-models-integration.mjs
Dyanari.exe --self-test
```

By default, `actions-integration.mjs` refuses to reuse an already-open Calculator. Maintainers can explicitly pass `--reuse-test-calculator` for an existing disposable test instance; that option replaces its current calculation. The Notepad test refuses unrelated existing Notepad windows; `--reuse-test-notepad` permits reuse only when all visible window titles begin with the owned test-note prefix. These scripts use isolated permissions/databases and leave their owned test applications open for inspection. The main application permissions remain unchanged. The native fixture test opens and closes only its own fixture. Tests write disposable `.dyanari-test-*` folders.

`build-desktop.ps1` builds both native projects and embeds the action helper with the backend/UI. The multi-gigabyte inference runtimes/models remain beside the desktop executable, as documented in the 0.2 release. Native helper source is in `action-helper/`; orchestration/permissions are in `actions.mjs`; validation feedback is in `validation.mjs`.

## Still pending

General mouse/keyboard automation across arbitrary applications; additional approved workflows and development commands; live microphone acceptance and neural/hands-free voice; structured PDF/DOCX/XLSX editing; inferred memory consolidation; advanced ComfyUI workflows; custom character avatar; Android access with authentication/TLS; signed installer/updater; broader adversarial and long-session testing. Existing model-output and local-storage limits in RELEASE-0.2.md still apply. Computer Control is intentionally scoped; an application's unrelated background networking is outside this app's network switch.
