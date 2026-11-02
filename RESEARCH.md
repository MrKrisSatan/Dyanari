# Background research

Enable Internet Access, then ask `research Iron Warriors Space Marines`, or supply an HTTPS article URL. An isolated anonymous WebView2 profile searches Google. Dyanari reads sources, returns linked evidence and retains dated excerpts when enabled. Search wording is cleaned; if initial sources are unreadable, a shorter topic is tried. Previously retained matching URLs are re-read rather than treated as fresh facts.

The main-chat server performs research before calling the language model. Fresh evidence takes priority over earlier assistant text. If no page can be read, no researched answer is generated. A local model can still misinterpret evidence; inspect links and correct mistakes. This is SQLite retrieval, not training model weights or exhaustive knowledge acquisition.

Source requests use public HTTPS, domain permissions and DNS-pinned addresses. Redirect targets are independently validated, with a five-hop bound. Research HTML is limited to 8 MB; returned text/excerpts are bounded. Ordinary JavaScript reading supports Lexicanum and Warhammer Community; other blocked sites may remain unreadable. Google consent can be declined in the anonymous profile, but CAPTCHA/human verification is never automated. Internet revocation, Stop and timeouts cancel work.

The notebook is model-independent and respects project namespaces. Private requests and disabled retention do not save research. The research panel exposes sources and forgetting; encrypted backup includes the notebook, and restore disables retention. Later image generation appends a bounded appearance brief from matching retained evidence. The generated image still needs review.

Verification: research.test.mjs covers recall/restart, private omission, source failure, supplied URLs, search retry, redirects, bridge claims/cancellation, revocation, project isolation and backup validation. research-http-integration.mjs proves failed/disabled research never reaches the language model. Separate real desktop tests read Google results and the supplied Lexicanum page; actual Qwen3 8B corrected conflicting prior lore using retrieved evidence.
