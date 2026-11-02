# Local document reading

Enable **Tools & File Access** and **Read Files**, then grant the containing workspace folder. Ask Dyanari to read an absolute PDF, DOCX or XLSX path. The `read_document` tool is available in chat and coding project tasks; it also appears in **Try a file tool**. No Internet or write permission is needed. The master Tools switch remains OFF in a new profile.

Results contain source coordinates, a SHA-256 of the snapshot, bounded records, warnings and `next_start`. Continue by supplying that offset and `expected_sha256` from the first response. A changed document rejects continuation. Text is split at 1,500 characters with `text_offset` when needed; records retain page, paragraph or sheet/cell references. Document text is untrusted input, not permission to execute its instructions.

Supported content:

- PDF text with page numbers, up to 200 pages. No OCR, rendering, annotations or attachments; reading order can differ from visual layout. Empty text pages are flagged.
- DOCX body paragraphs and table text. Headers, footers, drawings, embedded objects and comments are omitted. Field instructions and tracked deletions are omitted; this is not a visual or revision-history reader.
- XLSX sheet names/visibility, cell addresses, raw types/values and formulas with stored results. Formula results can be stale or absent. Formulas, macros and external links are never executed or fetched. Dates and number formats remain raw; styles and charts are not interpreted.

Limits: 16 MiB input; 2 concurrent readers; 20 seconds per parse; worker V8 heap limited to 192 MiB (not a total process-memory guarantee). ZIPs are never extracted: at most 2,048 entries, 64 MiB declared total expansion, 8 MiB per parsed XML part, CRC/size verification, bounded inflation, duplicate/traversal rejection. XML rejects DTDs and malformed namespaces and has depth/node limits. Workbooks have at most 100 sheets and 100,000 cells per sheet. Results use a 6,500-character record budget; individual fields have additional limits. Stop and settings revocation terminate workers, including changes observed from another host.

Dependencies are pinned in `package.json` and integrity-locked in `package-lock.json`: Mozilla PDF.js 6.5.438 and saxes 6.0.0, with their locked transitive dependencies. Build uses `npm ci --ignore-scripts`, verifies installed versions, and packages dependency files, licenses, PDF CMaps/fonts and the lockfile. Nothing is downloaded while reading a document. saxes is archived upstream; the parser is constrained and covered by malformed-input tests, and dependency maintenance remains necessary.

Primary references: [PDF.js API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html), [saxes repository](https://github.com/lddubeau/saxes). PDF.js receives bytes rather than a URL, with JavaScript evaluation and WebAssembly disabled.

Verification: `node --test documents.test.mjs`, `node documents-http-integration.mjs`, and `node document-smoke.mjs`. The smoke test also runs from the extracted desktop payload to catch missing packaged dependencies. Three small non-private fixtures were produced independently with python-docx, openpyxl and ReportLab; their generator is in `test-fixtures/documents/generate.py`. Those Python writers are not application dependencies. This feature does not edit Office files or claim visual fidelity.
