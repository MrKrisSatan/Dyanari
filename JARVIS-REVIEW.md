# Lessons from Jarvis

Reviewed 2026-11-02 at commit f2b7e375be1579133bea4aa1306e09473f9c9a0b. Source inspection, not a local Jarvis installation or acceptance run. No Jarvis implementation code was copied.

| Priority | Observed approach | Dyanari action |
|---|---|---|
| Immediate | Search distinguishes usable source text from links/navigation and has bounded fallback paths | Added supplied-source preflight, checked redirects, shorter-query retry, honest failure and metadata-only rejection; test actual model grounding |
| Next | Tool selection limits the schema list and can discover additional tools mid-loop | Extend current research-only narrowing into measured general routing; preserve permission enforcement and an expansion path |
| Next | Every utterance owns cancellation, playback callbacks and a terminal outcome | Extend Dyanari's new sentence queue with explicit lifecycle outcomes and measured first-audio/device playback acceptance |
| Next | Recent tool evidence can avoid unnecessary long-term recall | Add conservative retrieval gates and preserve source/tool provenance between turns; do not let assistant guesses become facts |
| Later | Lexical and semantic memory ranks are combined and evaluated separately | Evaluate Dyanari's actual recall with names, paraphrases, corrections and conflicting old answers before changing retrieval |
| Ongoing | Evaluation reports disclose failures and distinguish fixtures from actual model runs | Keep real small-model scenario checks beside unit tests; include blocked research and research-to-image follow-ups |

Sources:
- [Search implementation](https://github.com/isair/jarvis/blob/f2b7e375be1579133bea4aa1306e09473f9c9a0b/src/jarvis/tools/builtin/web_search.py)
- [Source-grounding evaluation](https://github.com/isair/jarvis/blob/f2b7e375be1579133bea4aa1306e09473f9c9a0b/evals/test_web_search_result_grounding.py)
- [Tool selection contract](https://github.com/isair/jarvis/blob/f2b7e375be1579133bea4aa1306e09473f9c9a0b/src/jarvis/tools/selection.spec.md)
- [Speech ownership contract](https://github.com/isair/jarvis/blob/f2b7e375be1579133bea4aa1306e09473f9c9a0b/src/jarvis/output/tts.spec.md)
- [Recall gate](https://github.com/isair/jarvis/blob/f2b7e375be1579133bea4aa1306e09473f9c9a0b/src/jarvis/memory/recall_gate.spec.md)
- [Published evaluations](https://github.com/isair/jarvis/blob/f2b7e375be1579133bea4aa1306e09473f9c9a0b/EVALS.md)

Jarvis uses a custom non-commercial license with same-terms conditions for derivatives. Learn architectural ideas and implement Dyanari's behavior independently; copying code would require reviewing those conditions. Jarvis itself documents model-dependent failures, so its feature list is not proof of reliable general autonomy.
