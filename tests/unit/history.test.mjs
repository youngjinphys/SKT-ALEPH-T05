import test from 'node:test';
import assert from 'node:assert/strict';

import { History } from '../../src/core/history.js';

test('undo and redo restore immutable snapshots', () => {
  const h = new History({ count: 0 }, { limit: 3 });
  h.commit({ count: 1 });
  h.commit({ count: 2 });

  assert.deepEqual(h.undo(), { count: 1 });
  assert.deepEqual(h.undo(), { count: 0 });
  assert.deepEqual(h.redo(), { count: 1 });
  assert.deepEqual(h.redo(), { count: 2 });
});

test('a new commit after undo clears the redo branch', () => {
  const h = new History({ count: 0 });
  h.commit({ count: 1 });
  h.commit({ count: 2 });
  h.undo();
  h.commit({ count: 9 });
  assert.equal(h.canRedo, false);
  assert.deepEqual(h.present, { count: 9 });
});

test('history enforces its configured limit', () => {
  const h = new History({ count: 0 }, { limit: 2 });
  h.commit({ count: 1 });
  h.commit({ count: 2 });
  h.commit({ count: 3 });
  assert.deepEqual(h.undo(), { count: 2 });
  assert.deepEqual(h.undo(), { count: 1 });
  assert.equal(h.canUndo, false);
});

test('replace updates the present state without adding an undo step', () => {
  const h = new History({ text: 'a' });
  h.replace({ text: 'ab' });
  assert.equal(h.canUndo, false);
  assert.deepEqual(h.present, { text: 'ab' });
});

test('commitFrom records a gesture baseline after transient replacements', () => {
  const h = new History({ x: 0 });
  const baseline = h.present;
  h.replace({ x: 4 });
  h.replace({ x: 8 });
  h.commitFrom(baseline, { x: 10 });
  assert.deepEqual(h.present, { x: 10 });
  assert.deepEqual(h.undo(), { x: 0 });
});
