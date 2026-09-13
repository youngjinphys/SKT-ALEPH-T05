# AI A Fixed-Test Evidence

## Immutable test integrity

The fixed specification and executable test hashes were independently checked against `t05/fixed-tests.sha256` before implementation:

- `t05/fixed-tests.json`: `2fca7dc7117d9e179d9d56bd9f5b3a0ad2884686f87721de20ad8cd2ca073154`
- `tests/t05/layer-order.test.mjs`: `26fb80a5632ffd6aba8963837c8478bf846b6cf368d69b34c177b3b5bf1c9ae5`

No fixed test, input, expectation, or executable test was changed after AI A start.

## Round A-R0 — baseline RED

Source: `0354fed0212facde5492500557e458b4022a8647`

Command equivalent: `npm run test:t05`

Result: **1 PASS / 9 FAIL**.

- PASS: T05-F01
- FAIL: T05-F02, T05-F03, T05-F04, T05-F05, T05-F06, T05-F07, T05-F08, T05-F09, T05-F10
- First failure cause: `src/core/layer-order.js` did not exist.

## Round A-R1 — after AI A first implementation pass

Code source: `3bebda01bd60f7fe397d820711239fa255b04470`

Command: `npm run test:t05`

Result: **8 PASS / 2 FAIL**.

- PASS: T05-F01, T05-F02, T05-F03, T05-F04, T05-F07, T05-F08, T05-F09, T05-F10
- FAIL: T05-F05, T05-F06
- Shared failure cause: `moveLayerBackward` is not implemented/exported.

The command was reproduced in a separate clean working directory built from the pinned test/module contents. It returned the same 8/10 result. The execution environment could not perform a network `git clone`, so this evidence does not falsely claim a network clone; AI B should verify the repository itself with the commands in `HANDOFF.md`.

## AI A error-round accounting

Under the task definition (a round counts as an error round when one or more of the fixed 10 tests FAIL):

- A-R0: error round
- A-R1: error round
- AI A error rounds so far: **2**

AI A stopped after A-R1 as required by the pre-fixed one-pass stop rule. No second implementation/fix pass was performed.
