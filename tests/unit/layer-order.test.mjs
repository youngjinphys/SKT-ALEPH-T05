import test from 'node:test';
import assert from 'node:assert/strict';

import { createDocument } from '../../src/core/document.js';
import { getLayerMoveState, moveLayerBackward, moveLayerForward } from '../../src/core/layer-order.js';

// This is a supplementary regression suite for src/core/layer-order.js.
// It intentionally does NOT duplicate, weaken, or restate any of the 10
// immutable T05 fixed tests in tests/t05/layer-order.test.mjs (that file
// and t05/fixed-tests.json are off limits). It only covers edge cases the
// fixed suite does not exercise, because src/app.js silently depends on
// these properties: moveSelectedLayerBackward/Forward() feed the return
// value straight into commitDocument(), whose no-op guard compares the
// previous document to the new one by value. If either mover ever mutated
// its input in place, that guard would treat every reorder as a no-op and
// undo/redo would silently stop working for z-order changes even though
// the canvas would still look correct.

function makeLayer(id) {
  return {
    id,
    text: id.toUpperCase(),
    x: 0.5,
    y: 0.5,
    width: 0.72,
    fontSize: 0.065,
    color: '#ffffff',
    fontFamily: 'sans-serif',
    fontWeight: 700,
    textAlign: 'center',
    lineHeight: 1.18,
  };
}

function makeDocument(layerIds = ['bottom', 'middle', 'top']) {
  const doc = createDocument('1:1');
  doc.textLayers.push(...layerIds.map(makeLayer));
  return doc;
}

function ids(doc) {
  return doc.textLayers.map((layer) => layer.id);
}

test('moveLayerForward does not mutate its input document', () => {
  const doc = makeDocument();
  const before = JSON.stringify(doc);
  moveLayerForward(doc, 'middle');
  assert.equal(JSON.stringify(doc), before, 'input document must stay untouched (pure function)');
});

test('moveLayerBackward does not mutate its input document', () => {
  const doc = makeDocument();
  const before = JSON.stringify(doc);
  moveLayerBackward(doc, 'middle');
  assert.equal(JSON.stringify(doc), before, 'input document must stay untouched (pure function)');
});

test('forward then backward on the same layer round-trips to the original order', () => {
  const doc = makeDocument();
  const moved = moveLayerForward(doc, 'middle');
  const restored = moveLayerBackward(moved, 'middle');
  assert.deepEqual(ids(restored), ids(doc));
});

test('backward then forward on the same layer round-trips to the original order', () => {
  const doc = makeDocument();
  const moved = moveLayerBackward(doc, 'middle');
  const restored = moveLayerForward(moved, 'middle');
  assert.deepEqual(ids(restored), ids(doc));
});

test('a single-layer document allows no movement in either direction', () => {
  const doc = makeDocument(['only']);
  assert.deepEqual(getLayerMoveState(doc, 'only'), { canMoveBackward: false, canMoveForward: false });
  assert.deepEqual(ids(moveLayerForward(doc, 'only')), ['only']);
  assert.deepEqual(ids(moveLayerBackward(doc, 'only')), ['only']);
});

test('a two-layer document supports exactly one swap in each direction', () => {
  const doc = makeDocument(['bottom', 'top']);
  assert.deepEqual(ids(moveLayerForward(doc, 'bottom')), ['top', 'bottom']);
  assert.deepEqual(ids(moveLayerBackward(doc, 'top')), ['top', 'bottom']);
});

test('moving forward twice from the bottom of a 3-layer stack reaches the top, then stays put', () => {
  const doc = makeDocument();
  const once = moveLayerForward(doc, 'bottom');
  assert.deepEqual(ids(once), ['middle', 'bottom', 'top']);
  const twice = moveLayerForward(once, 'bottom');
  assert.deepEqual(ids(twice), ['middle', 'top', 'bottom']);
  const thrice = moveLayerForward(twice, 'bottom');
  assert.deepEqual(ids(thrice), ['middle', 'top', 'bottom']);
  assert.equal(getLayerMoveState(thrice, 'bottom').canMoveForward, false);
});

test('an unknown layer id reports no movement and both movers leave the order unchanged', () => {
  const doc = makeDocument();
  assert.deepEqual(getLayerMoveState(doc, 'missing'), { canMoveBackward: false, canMoveForward: false });
  assert.deepEqual(ids(moveLayerForward(doc, 'missing')), ids(doc));
  assert.deepEqual(ids(moveLayerBackward(doc, 'missing')), ids(doc));
});

test('reordering preserves every property of every layer, not only the moved one', () => {
  const doc = makeDocument();
  doc.textLayers[0].color = '#ff0000';
  doc.textLayers[2].fontWeight = 400;
  const next = moveLayerForward(doc, 'middle');
  for (const before of doc.textLayers) {
    const after = next.textLayers.find((layer) => layer.id === before.id);
    assert.deepEqual(after, before, `layer ${before.id} must retain all of its properties`);
  }
});
