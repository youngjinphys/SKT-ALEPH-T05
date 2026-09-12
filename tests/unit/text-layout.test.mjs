import test from 'node:test';
import assert from 'node:assert/strict';

import { wrapText } from '../../src/core/text-layout.js';

const measure = (text) => text.length * 10;

test('wraps words without exceeding the requested width', () => {
  const lines = wrapText('alpha beta gamma', 60, measure);
  assert.deepEqual(lines, ['alpha', 'beta', 'gamma']);
});

test('preserves explicit newlines including empty paragraphs', () => {
  const lines = wrapText('one\n\nthree', 100, measure);
  assert.deepEqual(lines, ['one', '', 'three']);
});

test('breaks a single long token rather than overflowing forever', () => {
  const lines = wrapText('abcdefgh', 30, measure);
  assert.deepEqual(lines, ['abc', 'def', 'gh']);
});

test('returns a visible empty line for empty text', () => {
  assert.deepEqual(wrapText('', 100, measure), ['']);
});
