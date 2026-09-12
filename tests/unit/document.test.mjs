import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ASPECT_RATIOS,
  createDocument,
  createTextLayer,
  getOutputSize,
  getCoverTransform,
  movePointByPixels,
  resizeTextLayer,
} from '../../src/core/document.js';

test('defines exact export dimensions for all required aspect ratios', () => {
  assert.deepEqual(getOutputSize('1:1'), { width: 1080, height: 1080 });
  assert.deepEqual(getOutputSize('4:5'), { width: 1080, height: 1350 });
  assert.deepEqual(getOutputSize('9:16'), { width: 1080, height: 1920 });
  assert.deepEqual(Object.keys(ASPECT_RATIOS), ['1:1', '4:5', '9:16']);
});

test('document coordinates stay normalized across aspect ratio changes', () => {
  const doc = createDocument('1:1');
  const text = createTextLayer('hello');
  text.x = 0.25;
  text.y = 0.8;
  doc.textLayers.push(text);

  doc.aspectRatio = '9:16';
  assert.equal(doc.textLayers[0].x, 0.25);
  assert.equal(doc.textLayers[0].y, 0.8);
});

test('cover transform always fills the canvas and centers the default focal point', () => {
  const t = getCoverTransform({
    imageWidth: 1600,
    imageHeight: 900,
    canvasWidth: 1080,
    canvasHeight: 1920,
    focalX: 0.5,
    focalY: 0.5,
    zoom: 1,
  });
  assert.ok(t.drawWidth >= 1080);
  assert.ok(t.drawHeight >= 1920);
  assert.ok(t.x <= 0);
  assert.ok(t.y <= 0);
  assert.ok(t.x + t.drawWidth >= 1080);
  assert.ok(t.y + t.drawHeight >= 1920);
});

test('cover transform clamps focal points so no blank edge is exposed', () => {
  const left = getCoverTransform({
    imageWidth: 1600,
    imageHeight: 900,
    canvasWidth: 1080,
    canvasHeight: 1920,
    focalX: -10,
    focalY: -10,
    zoom: 1,
  });
  const right = getCoverTransform({
    imageWidth: 1600,
    imageHeight: 900,
    canvasWidth: 1080,
    canvasHeight: 1920,
    focalX: 10,
    focalY: 10,
    zoom: 1,
  });
  for (const t of [left, right]) {
    assert.ok(t.x <= 0);
    assert.ok(t.y <= 0);
    assert.ok(t.x + t.drawWidth >= 1080 - 1e-6);
    assert.ok(t.y + t.drawHeight >= 1920 - 1e-6);
  }
});

test('keyboard movement converts output pixels into normalized document movement', () => {
  const p = movePointByPixels({ x: 0.5, y: 0.5 }, 10, -20, { width: 1080, height: 1920 });
  assert.equal(p.x, 0.5 + 10 / 1080);
  assert.equal(p.y, 0.5 - 20 / 1920);
});

test('text resize is bounded to usable dimensions and font sizes', () => {
  const layer = createTextLayer('text');
  const resized = resizeTextLayer(layer, { width: -1, fontSize: 5000 });
  assert.ok(resized.width >= 0.05);
  assert.ok(resized.fontSize <= 0.25);
});
