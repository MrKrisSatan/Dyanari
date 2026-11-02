# Dyanari 0.7.0 - Persistent project tasks and maintainer checklist

The repository now includes [TODO.md](TODO.md), [AGENTS.md](AGENTS.md) and [DEVELOPMENT.md](DEVELOPMENT.md). These identify verified work, incomplete requirements, acceptance conditions, publishing steps and the next ready task for Astra/Codex or a future maintainer. Stable task ids and linked evidence prevent a partial feature being checked off as finished.

## Persistent project tasks

Open **Project tasks**. Enable that capability, Tools, Read Files and Run Tools, and approve a writable workspace. Select Code & tests, Git & GitHub or Linked MCP mode, enter the original request, and optionally select a required saved verification recipe. Build recipes, Git/GitHub and MCP still need their own permissions.

Task requests, model/tool messages and bounded event records persist in SQLite independently of the chat model. They are separate work records, not private chat. Private-task requests are rejected; use private Conversation for ephemeral discussion. No task text is automatically turned into a canonical memory.

With **Continue after I approve each operation** selected, a model can request an operation, pause for its exact existing Development/Linked projects preview, receive the actual approved result, then continue the same original request. The task never approves its own command, GitHub write or MCP call. Without that option, the result leaves the task ready for an explicit Resume.

Choose a required verification recipe for work that must end with a particular test/build. It must be enabled and inside the selected coding workspace. The task cannot finish while that recipe lacks a real successful result. Bounded application feedback asks a model to complete the originally selected verification; a promise does not satisfy it. Nonzero checks remain needs_attention even if the model says success. A successful rerun of the same saved check can replace its failed result.

Finished means the model ended its turn without recorded failed/required checks. It is not independent proof that the full request is correct. Review actual results. Task modes offer a limited relevant tool set for small local models; they do not implement general Windows/browser autonomy.

## Controls and recovery

- Pause/Stop cancels current inference or its approved command/MCP operation and prevents automatic continuation. Already completed file changes, commits or network writes are not rolled back.
- Restart converts interrupted queued/running/approval/executing records to paused, clears ephemeral approvals and records that an operation's outcome may be unknown. It never automatically replays a mutation. Inspect files, repositories and run logs before explicitly resuming.
- Settings changes, permission revocation and Stop all tasks pause work. Backup restoration disables Project tasks; task records are not included in the memory/chat backup.
- Rejected/expired/invalidated approvals pause the task. An explicit fresh approval is needed for any newly proposed operation. Removing a task record does not undo executed work.
- Application-managed file paths, saved recipe folders and MCP working folders must remain under the selected task workspace, in addition to the normal leaf permission checks. Approved external code still runs with the Windows account's permissions; this is not an OS sandbox.
- One in-process model task runs at a time alongside the existing chat/vision/image guards. Resource leases still protect other instances sharing the profile. Queueing does not add cross-profile GPU isolation.
- Bounds: 50 stored tasks, 24 model turns per task, eight turns per continuation segment and at most eight tool calls per model turn. Inference segments time out after three minutes; approved commands retain their existing timeout/output limits. Long tool results and event tails are truncated in task context. If the limit is reached, inspect results and start a reviewed follow-up.

## Related fixes

Ordinary settings changes now preserve previously resolved workspace grants rather than silently following a replaced junction. New grants/recipes/linked profiles still validate their paths, while runtime checks revalidate actual access. Turning permissions OFF remains possible when an old configured folder or entry script has disappeared. Owned MCP sessions disconnect when their working folder becomes invalid.

Chat/task tool validation now correctly handles JSON string arrays such as git_commit.files; JavaScript typeof does not identify arrays as “array.” Existing Git permissions, explicit-file rules and approval previews remain in place.

## Verification

Thirteen project-task tests cover a real approved command and continuation, retained intent, failed-result honesty, required verification, manual continuation, rejected/expired previews, workspace bounds, pause/revocation, process cancellation, restart, model-independent persistence, turn limits, string-array validation and stale/junction workspace behavior.

Authenticated HTTP acceptance exercises a real background task, exact approval, actual command execution, automatic continuation, private-request rejection, Stop and backup permission reset using a deterministic local inference fixture. Separately, actual Qwen3 4B Instruct requested a saved recipe, waited for approval, saw the real marker/exit code and continued automatically under the same request. The marker was produced by the approved command, not model text.

The installer remains unsigned, and clean-machine installation acceptance remains open in TODO.md. Speech/device/browser/document/mobile work remains in the tracker. This release is an incremental implementation, not completion of the full brief.
