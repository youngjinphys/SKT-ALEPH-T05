import test from 'node:test';
import assert from 'node:assert/strict';

import { createDocument } from '../../src/core/document.js';
import { History } from '../../src/core/history.js';
import { renderDocument } from '../../src/core/renderer.js';

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

function makeDocument() {
  const doc = createDocument('1:1');
  doc.textLayers.push(makeLayer('bottom'), makeLayer('middle'), makeLayer('top'));
  return doc;
}

function ids(doc) {
  return doc.textLayers.map((layer) => layer.id);
}

async function loadApi() {
  return import('../../src/core/layer-order.js');
}

function fakeContext(draws) {
  return {
    canvas: { width: 1080, height: 1080 },
    font: '',
    fillStyle: '',
    textBaseline: '',
    textAlign: '',
    lineJoin: '',
    clearRect() {},
    save() {},
    restore() {},
    measureText(text) { return { width: Math.max(1, text.length * 10) }; },
    fillText(text) { draws.push(text.toLowerCase()); },
  };
}

test('T05-F01 three text layers retain an observable bottom-to-top order', () => {
  const doc = makeDocument();
  assert.deepEqual(ids(doc), ['bottom', 'middle', 'top']);
});

test('T05-F02 a middle layer can move in both directions', async () => {
  const { getLayerMoveState } = await loadApi();
  assert.deepEqual(getLayerMoveState(makeDocument(), 'middle'), {
    canMoveBackward: true,
    canMoveForward: true,
  });
});

test('T05-F03 forward moves the selected layer exactly one position', async () => {
  const { moveLayerForward } = await loadApi();
  assert.deepEqual(ids(moveLayerForward(makeDocument(), 'middle')), ['bottom', 'top', 'middle']);
});

test('T05-F04 forward is a no-op at the top boundary', async () => {
  const { moveLayerForward, getLayerMoveState } = await loadApi();
  const doc = makeDocument();
  assert.deepEqual(ids(moveLayerForward(doc, 'top')), ['bottom', 'middle', 'top']);
  assert.equal(getLayerMoveState(doc, 'top').canMoveForward, false);
});

test('T05-F05 backward moves the selected layer exactly one position', async () => {
  const { moveLayerBackward } = await loadApi();
  assert.deepEqual(ids(moveLayerBackward(makeDocument(), 'middle')), ['middle', 'bottom', 'top']);
});

test('T05-F06 backward is a no-op at the bottom boundary', async () => {
  const { moveLayerBackward, getLayerMoveState } = await loadApi();
  const doc = makeDocument();
  assert.deepEqual(ids(moveLayerBackward(doc, 'bottom')), ['bottom', 'middle', 'top']);
  assert.equal(getLayerMoveState(doc, 'bottom').canMoveBackward, false);
});

test('T05-F07 reordering preserves the selected layer identity and content', async () => {
  const { moveLayerForward } = await loadApi();
  const doc = moveLayerForward(makeDocument(), 'middle');
  const selected = doc.textLayers.find((layer) => layer.id === 'middle');
  assert.equal(selected?.id, 'middle');
  assert.equal(selected?.text, 'MIDDLE');
});

test('T05-F08 one undo restores the exact pre-reorder layer order', async () => {
  const { moveLayerForward } = await loadApi();
  const before = makeDocument();
  const history = new History(before);
  history.commit(moveLayerForward(before, 'middle'));
  assert.deepEqual(ids(history.undo()), ['bottom', 'middle', 'top']);
});

test('T05-F09 one redo reapplies the reordered layer order', async () => {
  const { moveLayerForward } = await loadApi();
  const before = makeDocument();
  const history = new History(before);
  history.commit(moveLayerForward(before, 'middle'));
  history.undo();
  assert.deepEqual(ids(history.redo()), ['bottom', 'top', 'middle']);
});

test('T05-F10 renderer consumes the same reordered array used for final output', async () => {
  const { moveLayerForward } = await loadApi();
  const draws = [];
  renderDocument(fakeContext(draws), moveLayerForward(makeDocument(), 'middle'), null);
  assert.deepEqual(draws, ['bottom', 'top', 'middle']);
});
