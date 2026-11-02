# Dyanari 0.6.0 - Memory review and consolidation

The Memory page now supports categories, source labels, optional suggestions from non-private chat, related-wording review, reversible consolidation, searchable metadata and JSON export. The canonical memories remain in the same SQLite table, with their existing ids, content and project scopes. No chat model owns the memory store.

## Categories and sources

Choose general, preference, relationship, project, lore, episode or workflow when adding or correcting a memory. Categories and sources accompany recalled facts so the model can distinguish fictional lore and user-reviewed information from unclassified legacy records. Older memories receive general/legacy metadata without changing their contents or ids. Source labels do not guarantee factual correctness or grant permissions.

Search covers content, project namespace and category; category filtering is also available. Editing supports content, category and project scope. Changes require the snapshot shown in the interface; a stale edit/delete fails instead of overwriting newer data. Edits/deletes remove the affected cached embedding. Retrieval remains project-filtered, with keyword fallback when the optional embedding model is unavailable.

## Suggestions

Enable **Suggest stable facts from non-private chat** if wanted. It defaults OFF, and backup restore resets it OFF. Simple local rules propose first-person preferences, selected personal facts, explicitly phrased project decisions and workflow preferences. No extraction model, external service or additional GPU allocation is needed.

Only user messages are considered, never assistant replies or tool outputs. Private messages do not enter this workflow. Questions, selected hypothetical/quoted statements, credential-like statements and explicit “Remember” commands are excluded by conservative heuristics. The rules are intentionally incomplete: they can miss useful facts or produce a mistaken suggestion, so nothing is recalled as a saved fact until the user approves it. Correct the text/category first when needed. Dismissals keep a hash to suppress repeated identical proposals, not the dismissed proposal's plaintext.

**Review recent project chat** scans up to 50 stored user messages in the active namespace. Pending suggestions are capped at 300 and survive app restarts. Existing explicit “Remember that …” requests still save directly outside private mode. Workflow preferences never bypass tool execution permissions.

## Consolidation and recovery

**Find related wording** suggests at most 30 same-project pairs from a bounded lexical scan (up to 5000 records, 150,000 comparisons, first 200 distinct words per record). Similar text may express different or contradictory facts; this is not an automatic duplicate verdict. Review originals and write the corrected replacement yourself. Projects cannot be consolidated together.

The replacement requires a single-use preview, expiring after five minutes. Original snapshots are checked again inside a SQLite transaction. The operation either completes entirely or rolls back. **Undo consolidation** restores original facts with their categories/sources, provided the replacement has not been changed. Restored records may receive new ids. Undo refuses conflicting changes or duplicates rather than overwriting them.

Recovery copies contain the original text until cleared. **Clear consolidation recovery history** removes those copies without deleting current saved memories. Deleting a saved memory purges its metadata/vector and matching multi-step consolidation recovery lineage. It does not erase earlier chat messages; chat-history deletion is separate. Clearing chat history also clears pending suggestion text.

The existing canonical table has a global exact-content uniqueness constraint. This release preserves it instead of rebuilding a user's memory table: identical text cannot be saved under two different namespaces. The app reports that conflict; use distinct wording or edit the existing scope. Whitespace-normalized exact duplicates within one project are detected without merging differently cased facts.

## Export and encrypted backup

**Export memories JSON** is an explicit, unencrypted local download containing saved facts and metadata (up to 100,000 records). It is not uploaded anywhere. The encrypted backup format remains compatible with version-1 backups and now carries category/source metadata, matched on content/project during restore rather than relying on old ids.

Pending suggestions, dismissed hashes and consolidation recovery history are not included in encrypted backups. Tool permissions, linked-project grants and automatic suggestions reset OFF on restore. The restore endpoint now accepts encrypted backup envelopes up to 32 MiB; other API requests retain the 1 MB limit. UTF-8 request bodies are decoded after byte collection so split multibyte characters are preserved. Local SQLite storage and recovery snapshots retain the existing Windows profile protection; only the exported encrypted backup has password encryption.

## Verification

Fourteen new memory tests cover legacy database compatibility, metadata, duplicates, private mode, proposal correction/dismissal, namespace boundaries, stale edits, vector invalidation, consolidation/undo, changed-state rejection, multi-step forget recovery and metadata restoration and changes while embeddings are in flight. HTTP acceptance exercises actual chat routing with a local deterministic inference fixture, review-before-recall, private omission, merge/undo, encrypted metadata restore, search/export and an encrypted Unicode backup larger than the old 1 MB limit.

Real Qwen3 4B Instruct and Qwen3-VL 2B recall tests passed across model changes and a backend restart, including recall without conversation history. Existing GitHub/build/MCP tests remain part of regression coverage. Suggestions do not provide comprehensive semantic extraction; model-driven consolidation, deeper episodic memory and broader long-session behavior remain future work. The installer remains an unsigned preview with fresh-machine acceptance still pending.
