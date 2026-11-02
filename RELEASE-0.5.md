# Dyanari 0.5.0 - Linked local projects and REA

The **Linked projects** page connects Dyanari to local stdio MCP tool servers. REA from [morluto/rea](https://github.com/morluto/rea) is the first pinned install option. Other local Node/Python MCP projects can be linked by their absolute entry script. Ordinary command-line projects continue to use Development recipes.

## Connect REA

1. Install/upgrade with DyanariSetup-0.5.0.exe. The installer includes a hash-verified official Node 24.22.1 distribution with npm, in addition to portable Git/GitHub CLI. No global PATH or npm configuration is changed.
2. In Tools & permissions, approve a writable analysis workspace. Enable Tools & File Access, Read Files and Run Tools. Enable Linked projects on its page. Internet Access is needed to install packages, not for Dyanari's local stdio transport.
3. Enter that workspace and choose **Add REA**. Click **Install REA**, review the pinned package and command, and approve the operation. It installs `rea-agents@6.8.0` privately under the Dyanari profile, with lifecycle scripts disabled and the package integrity checked against the pinned catalog. Other agents' registrations/configurations and skills are not changed.
4. Click **Start / connect**, then approve its exact executable, arguments and working folder. Dyanari performs MCP initialization and discovers tool schemas. Starting a server runs external code; it does not automatically analyse a target.
5. Discover a tool, copy its exact name into that project's allowed-tool list, and save tool access. Tool discovery is searchable and bounded to 20 matches per query; the full catalog stays outside the small chat model's context.
6. Enter the tool name/JSON arguments and choose **Preview tool call**, or ask Dyanari to prepare it conversationally. Approve the exact call. Results, tool errors and server logs appear on the page; the model can read actual run records with `list_linked_project_runs`.

Verified example tool: `analyze_javascript_application`, with arguments `{"input_path":"C:\\Projects\\Analysis\\sample-app","detail":"summary"}`. Supply your actual target path and review REA's schema. Static JavaScript analysis returns evidence without running the analysed application. More complex native/runtime tools have their own requirements and side effects; Ghidra, IDA, Hopper, debuggers and target software are not installed by this connector.

## Other projects

Clone/read the project and install its dependencies using approved Development recipes. In Linked projects, choose a name and an approved working folder, select Node or Python, then provide arguments such as `["C:\\Projects\\MyTools\\server.mjs","--stdio"]`. The first argument must be an absolute existing entry script in an approved workspace. Approve starting the server, discover its tools, and explicitly allow the tool names you want to use.

Only local stdio MCP is supported. HTTP/SSE MCP, executables other than Node/Python, automatic plugin/skill imports and remote servers are not supported by this release. Python environments remain separately installed. Interactive package setup commands are not driven by Dyanari; REA's own `setup` command is not run.

## Process and permission behavior

- Linked projects default OFF and require independent Tools, Read Files and Run Tools permissions. Backup restoration clears the flag and linked profiles.
- Install/start/tool calls require single-use, five-minute previews. Launch entry changes, configuration changes, stale tool catalogs and changed server sessions invalidate approvals.
- Allowed tool names are an additional check; a server's own read-only annotations never bypass approval. MCP tools remain untrusted external code/data.
- Server sampling, elicitation and unsupported client requests are rejected. The client supports roots/list, ping, bounded paginated catalogs and JSON-RPC newline framing.
- Credential-like environment variable names and startup injection variables are removed before starting servers. This does not prevent an external process reading other files with the Windows account's permissions.
- Stop and timeout request termination of the owned Windows process tree. Disabling access, unlinking a project or changing its launch configuration disconnects it. Background sessions are not automatically restarted on application startup.
- Workspace roots are guidance, **not an operating-system sandbox**. External servers can access files/processes/network using the Windows account, and Dyanari's Internet switch does not firewall them. Only link and approve trusted projects/tools.
- Protocol frames are limited to 8 MB, catalogs to 2000 tools/20 pages, retained result JSON to 60,000 characters and server logs to 100,000 characters. Truncation is labelled. Full analysis evidence may remain in the linked server's session and can be queried with its own inspection tools.

## Verification

Nine new MCP fixture tests cover startup approvals, pagination, schema discovery, allowlists, actual calls/error returns, stale/expired/session grants, launch changes, roots, environment isolation, timeout/cancellation, malformed stdout, revocation and pinned-install previews. Authenticated HTTP tests exercise a real stdio server, an approved tool call and Stop as well as the existing build runner.

Real REA 6.8.0 installed successfully with lifecycle scripts disabled, connected as an MCP server, advertised 229 tools and statically analysed an owned fixture containing two JavaScript files with zero parse failures. No native analysis provider was needed. This verifies that path, not every REA tool/provider. REA's published 6.8.0 accepts output schema profiles `full` or `off`; Dyanari selects `off` to bound catalogs and retains compact input schemas. The current upstream README may describe newer, unreleased options.

The installer remains unsigned and fresh-machine setup/interactive authentication still need broader acceptance testing. Small local models can still make mistakes selecting tools or constructing complex arguments. The full Dyanari brief remains in progress.
