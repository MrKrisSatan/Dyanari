# Main-chat capability audit

All Features mounts existing controls alongside chat. `list_capabilities` reports enabled tools; `open_feature` offers a panel without granting permissions. Controls remain user-operated where setup or approval is required.

| Area | Chat access and controls |
|---|---|
| Research | Automatic research/source reading, recall, notebook and linked sources |
| Memory | Retrieval tools; review, correction, consolidation and recovery panel |
| Files/documents | Scoped text/code and PDF/DOCX/XLSX tools; workspace grants panel |
| Computer actions | Tool proposals; exact approval and target grants panel |
| Development | Build/test/Git/GitHub tools; reviewed execution panel |
| Project tasks | Task tools and durable review/pause/resume panel |
| Linked MCP | Discovery/call tools; server configuration, grants and approval panel |
| Models/resources | Model selection and resource controls panel |
| Personality | Model-independent personality editor panel |
| Activity/backup | Activity, recovery, deletion review and backup panel |
| Voice | Saved British Velvet speech, main-chat mute/Stop Voice; runtime controls panel |
| Vision | Image/screen tools; permission and upload controls panel |
| Images/3D | Generation tools, inline image/model cards, preview and Save As |
| Reminders | Scheduling tools and service controls panel |

`generate_stl` runs prompt → Qwen image → Tripo in one call. Results include source artwork and model id. STL/OBJ/PLY use inspected millimetre Z-up geometry; GLB preserves original scene units. Native Save As offers all four formats; cancelling writes nothing. Browser fallback uses available file-picker/download APIs.

Acceptance includes catalog-to-panel coverage, mute persistence, export cancellation/nonfinite geometry tests and actual main-chat image-to-Tripo execution. Independent trimesh import verified three geometry exports. Native Save As dialog interaction has not yet had automated UI acceptance. No generated mesh is certified print-ready.
