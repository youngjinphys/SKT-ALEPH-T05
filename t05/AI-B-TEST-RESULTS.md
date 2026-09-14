# AI B Fixed-Test Evidence

## Environment disclosures (read this before trusting any PASS below)

- Node.js available in this execution environment: v22.22.2. Repository contract (`package.json` `engines.node`, `.github/workflows/ci.yml`) pins `24.x`. All commands below still ran without error; no Node-24-only syntax is used anywhere in the diff. This mismatch is an execution-environment limitation, not a code change, and should be re-verified once on Node 24.x.
- This working copy is a plain extraction of the uploaded archive, not a git clone (`git status` reports "not a git repository"). AI B therefore cannot report commit SHAs the way `HANDOFF.md` asks AI A to. This mirrors AI A's own disclosed inability to perform a network `git clone`.
- No Chromium/Chrome/ChromeDriver binary and no outbound network access are available in this sandbox (`npm run test:browser` fails immediately with "Chromium/Chrome was not found"; a direct network probe to an external host returned a blocked/proxied response). The real CI (`ubuntu-latest`) ships Chrome preinstalled, so `npm run test:browser` is expected to run there. This is an environment gap, not a defect introduced by this change; it is disclosed rather than worked around or claimed as passing.

## Immutable test integrity (re-verified independently of AI A's own claim)

```
$ sha256sum -c t05/fixed-tests.sha256
t05/fixed-tests.json: OK
tests/t05/layer-order.test.mjs: OK
```

Re-checked again after every edit in this pass. No fixed test, input, expectation, or executable test was changed.

## Round B-R0 — inherited baseline (not independently re-run pre-fix)

AI A's Round A-R1 result (8 PASS / 2 FAIL: F05, F06, caused by a missing `moveLayerBackward` export) was verified by static code reading rather than by re-executing an unmodified copy: `src/core/layer-order.js` exported only `getLayerMoveState` and `moveLayerForward` before this pass, which alone deterministically produces exactly that 8/2 split against the unmodified fixed suite. Only an additive change (`moveLayerBackward`) was made afterward, so this baseline was not destructively re-verified in a separate clean copy.

## Round B-R1 — after adding `moveLayerBackward` only (core fix)

Command: `npm run test:t05`

Result: **10 PASS / 0 FAIL.**

- PASS: T05-F01 .. T05-F10 (all)

This is the same core-level result the T05 contract measures. Per `HANDOFF.md`'s own explicit warning ("core fixed test 8/10[→10/10]이라는 숫자만으로 사용자 기능이 완성되었다고 판단하면 안 된다"), work continued past this point to finish the UI wiring described in `HANDOFF.md` sections 1 and 5.

## Round B-R2 — after UI wiring (feature-complete pass)

Commands and results, run in this order:

```
$ npm run test:t05        → 10 PASS / 0 FAIL   (unchanged; re-confirms the UI change did not disturb core behavior)
$ npm test                → 47 PASS / 0 FAIL   (38 pre-existing + 9 new supplementary cases)
$ npm run lint             → Static checks passed: syntax, local-only privacy constraints, CSP, and upload allowlist.
$ npm run build            → Build complete: dist/ contains the static application and deployment security headers.
$ npm run test:browser     → FAILS in this sandbox only: "Chromium/Chrome was not found." (environment gap, see above)
$ sha256sum -c t05/fixed-tests.sha256 → both OK
```

## AI B error-round accounting

Using the same definition AI A used (a round counts as an error round when one or more of the 10 fixed tests FAIL):

- B-R1: not an error round (10/10 on the first `npm run test:t05` run after adding `moveLayerBackward`)
- B-R2: not an error round (10/10 again after UI wiring)
- AI B error rounds so far: **0** (across 2 full `npm run test:t05` executions performed in this pass)

## Files changed in this pass

- `src/core/layer-order.js` — added `moveLayerBackward(doc, layerId)`, symmetric to the existing `moveLayerForward`, using the same clone-then-swap immutable pattern. Fixes F05/F06.
- `index.html` — added "뒤로"/"앞으로" buttons inside `#text-inspector`, before `#delete-text`. No inline event handlers, no new external resources; CSP/accept attributes untouched.
- `src/app.js` — imports `getLayerMoveState`, `moveLayerBackward`, `moveLayerForward`; adds `moveBackward`/`moveForward` element refs; binds their `click` events to two new one-line handler methods that reuse the existing `commitDocument()` path (one History commit per click, no-op guarded); extends `updateInspector()` to disable each button via `getLayerMoveState` when the boundary is reached, and to disable both when nothing is selected. Selected-layer id (`this.selectedId` / `this.editor.selectedId`) is never reassigned by the new code, preserving selection identity across reorders.
- `src/styles.css` — one explicit `width: 100%` rule for the two new buttons (defensive; does not rely on implicit CSS Grid stretch behavior that could not be visually verified in this sandbox).
- `tests/unit/layer-order.test.mjs` — **new** supplementary regression file. Does not touch, weaken, or duplicate `t05/fixed-tests.json`, `tests/t05/layer-order.test.mjs`, or `t05/fixed-tests.sha256`. Runs under `npm test`, a separate command from `npm run test:t05`, so it never changes the observable "10/10" count of the fixed T05 suite. Covers: purity/non-mutation of both movers, forward↔backward round-trips, 1-layer and 2-layer boundary documents, unknown layer ids, and full property preservation across a reorder (not just id/text).
- `t05/AI-B-TEST-RESULTS.md` — this file.

## Protected boundaries checked, not modified

- `t05/fixed-tests.json`, `tests/t05/layer-order.test.mjs`, `t05/fixed-tests.sha256` — byte-identical (SHA-256 verified before and after).
- `src/core/file-validation.js`, `src/core/image-processing.js` — untouched. `.png`/`.jpeg` allowlist, 30 MiB / 32,000,000-pixel caps, and canvas re-encode-based EXIF stripping remain exactly as before.
- CSP meta tag (`connect-src 'none'`, `script-src 'self'`, `object-src 'none'`) and `accept=".png,.jpeg"` — untouched and re-verified by `scripts/static-check.mjs`, which also confirms no `localStorage`, `sessionStorage`, `fetch(`, `XMLHttpRequest`, `WebSocket`, `eval(`, `innerHTML`, `insertAdjacentHTML`, `new Function`, or literal `http(s)://` string was introduced anywhere under `src/` or `index.html`.
- `renderer.js`'s single-array (`doc.textLayers` order = paint order) semantics — untouched; no parallel z-index field was added, per `HANDOFF.md` item 6.

## Manual UI-level trace of the 10 fixed scenarios (browser execution unavailable in this sandbox)

The 10 fixed tests only exercise `src/core/*`. Since `npm run test:browser` cannot run here, each scenario was additionally traced by hand through the actual `AppController`/`CanvasEditor` code path added or touched in this pass:

- F01/F02: `updateLayers()`/`updateInspector()` read `doc.textLayers` and `getLayerMoveState` directly; a freshly added 3-layer document renders 3 layer buttons, and selecting the middle one leaves both new buttons enabled (`index=1` of 3 ⇒ both booleans true).
- F03/F04: `moveSelectedLayerForward()` → `moveLayerForward(this.doc, this.selectedId)` → `commitDocument(next)`. At the top boundary the returned `next` is content-identical to `this.doc`, so `commitDocument`'s `sameDocument` guard skips the commit; `updateInspector()` still runs via `updateAll()` and sets `moveForward.disabled = true` from `getLayerMoveState`.
- F05/F06: symmetric to F03/F04 via `moveSelectedLayerBackward()`.
- F07: neither new handler reassigns `this.selectedId` or `this.editor.selectedId`; `CanvasEditor.setState()` only clears selection if the id is missing from the new `textLayers`, which a reorder never causes.
- F08/F09: `commitDocument()` calls `this.history.commit(next)` exactly once per click, so one `#undo` click and one `#redo` click map 1:1 to one reorder, identical to the core `History` contract already covered by F08/F09.
- F10: `CanvasEditor.render()` and `exportImage()`'s `renderDocumentToBlob()` both call the same `renderDocument()` over the same `this.doc.textLayers`/`this.doc`, so preview and export cannot diverge by construction; this was true before this pass and is unchanged by it.

This trace is a substitute for, not a replacement of, an actual headless-browser run. Running `npm run check` (or just `npm run test:browser`) in an environment with Chrome installed — e.g., the project's own CI — is the recommended final confirmation step.
