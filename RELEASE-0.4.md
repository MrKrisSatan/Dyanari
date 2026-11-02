# Dyanari 0.4.0 - GitHub and build/test tools

Open **Development** in the sidebar. This release adds real repository tools and user-defined executable recipes. It retains model-independent memory and the previous companion/file/voice/vision features.

## Setup and access

The Windows x64 installer downloads official portable MinGit 2.56.0.4 and GitHub CLI 2.103.3, verifying release SHA-256 hashes and sizes. No global PATH changes are made. Use **Dyanari - Connect GitHub** in the Start menu to authenticate through the official CLI's web/device flow. Dyanari does not ask for a token in chat or store one in its settings, memories, backups or execution records. GitHub CLI manages its own credentials; its login may be shared with other CLI installations. Source users may instead use an existing Git Credential Manager configuration. Existing native Git system configuration is retained so credential helpers work.

Enable Tools & File Access, Read Files, and Run Tools. Approve a workspace folder. In Development, separately enable Local Git, GitHub and/or the Build & test runner. GitHub additionally requires Internet Access and an explicit owner/repository grant. New flags default OFF and encrypted-backup restoration resets them, repository grants and executable recipes. A Git author name/email can be set per Dyanari profile without modifying global Git identity; blank fields use the existing repository/global identity.

## Git and GitHub

Ask Dyanari to inspect status, working/staged diffs or recent commits; clone an approved repository into a new workspace folder; create a branch; commit explicitly named existing/new files; fast-forward pull; or push the exact reviewed HEAD to the current branch. Requests for Git changes produce five-minute, single-use previews in Development. Approvals bind the repository state, selected commit file contents, destination and branch. Changes invalidate previews. A commit requires an initially empty index, and pull/push require a clean working tree. Commit hooks, push hooks, fsmonitor, external diff programs and text conversion are disabled for app-managed Git operations.

GitHub tools list repositories, issues and pull requests, and prepare issues, comments and pull requests. Every write previews its exact destination/title/body for approval. Only HTTPS github.com origins are supported. Force push, reset, deletion, arbitrary Git arguments, linked worktrees, automatic conflict resolution and special repository filter/include/credential/URL/HTTP configurations are unsupported. File deletion commits and automatic merge-conflict repair are not implemented. Listings are bounded to 50 repositories or 30 issues/PRs per request.

Example: “Inspect C:\Projects\MyApp, fix the failing code, run my saved tests, and prepare a commit of src/app.js.” Review the execution preview, approve it, then ask for a push or PR preview. A pending request has not executed. `list_development_runs` exposes actual approved results to the model afterward.

## Build and test runner

Save a named recipe with an approved writable working folder, a tool (`node`, `npm`, `dotnet`, `python`), an explicit JSON argument array and a 1–1200 second timeout. Node uses the bundled executable. npm requires an existing Node/npm installation; dotnet/Python require installed development tools. No SDKs or project dependencies are silently installed. Examples: `node ["--test"]`, `npm ["test"]`, `dotnet ["test"]`, `python ["-m","unittest","discover"]`. Build commands such as `npm ["run","build"]` and `dotnet ["build"]` use the same runner.

Each run needs a fresh approval of its exact executable, arguments, working folder, timeout and source digest. Source changes invalidate approval. The bounded source digest excludes .git, node_modules, bin, obj, venv/.venv, runtime and data; it does not freeze dependencies or eliminate filesystem races. Executables receive arguments directly without shell interpolation. npm runs its JS entry point rather than a .cmd shim. npm itself may execute project scripts as intended.

**This is not a sandbox.** Approved code runs with the Windows account's filesystem/network permissions, including access beyond the selected folder. Dyanari's Internet switch gates its own network/GitHub tools, not operating-system networking by a build or test process. Approve only trusted code and commands.

The page shows live bounded output, actual exit codes and persisted recent run records. Nonzero exit codes are failures, not successful tests. Output is capped at 2 MB per command; retained output tails are limited to 100,000 characters. Stop, timeout and permission revocation terminate the Windows process tree. Repository and executable mutations are serialised across instances sharing the profile. No rollback of already executed code or pushed commits is implied.

## Verification

- 54 application tests passed, including 11 new development tests: real branch/commit, explicit staging, hooks disabled, stale grants, destination checks, no shell interpolation, real failure exit codes, timeouts, cancellation/child termination, cross-instance revocation and pending GitHub writes.
- Ten authenticated HTTP acceptance checks passed against an isolated backend, including a real approved command, rejection of missing/reused approval and Stop invalidation.
- Real GitHub authentication, repository listing, cloning and fast-forward pull passed through the application engine. Seven actual file-engine tests passed in the cloned repository through the saved recipe runner. Credential exposure checks passed.
- Official MinGit and GitHub CLI archives were hash-verified, extracted and their version commands verified.

The GitHub source workflow runs service-independent tests on Windows. Optional voice, vision, embeddings, ComfyUI and Python syntax-check fixtures have separate service requirements. Fresh-machine setup, the interactive authentication shortcut and broader long-running project compatibility still need acceptance testing. Small local models may require straightforward, incremental requests and can still make coding mistakes.
