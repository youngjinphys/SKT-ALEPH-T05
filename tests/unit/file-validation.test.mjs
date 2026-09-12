import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FILE_LIMIT_BYTES,
  PIXEL_LIMIT,
  inspectExifOrientation,
  inspectImageHeader,
  validateFileMetadata,
} from '../../src/core/file-validation.js';

function pngHeader(width, height) {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return bytes.buffer;
}

function jpegHeader(width, height) {
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]).buffer;
}

function jpegWithExifOrientation(width, height, orientation) {
  const base = new Uint8Array(jpegHeader(width, height));
  const payload = Uint8Array.from([
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x4d, 0x4d, 0x00, 0x2a,
    0x00, 0x00, 0x00, 0x08,
    0x00, 0x01,
    0x01, 0x12, 0x00, 0x03,
    0x00, 0x00, 0x00, 0x01,
    0x00, orientation, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]);
  const length = payload.length + 2;
  const segment = new Uint8Array(payload.length + 4);
  segment.set([0xff, 0xe1, (length >> 8) & 0xff, length & 0xff]);
  segment.set(payload, 4);
  const bytes = new Uint8Array(base.length + segment.length);
  bytes.set(base.slice(0, 2));
  bytes.set(segment, 2);
  bytes.set(base.slice(2), 2 + segment.length);
  return bytes.buffer;
}

function jpegWithLittleEndianExifOrientation(width, height, orientation) {
  const base = new Uint8Array(jpegHeader(width, height));
  const payload = Uint8Array.from([
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x49, 0x49, 0x2a, 0x00,
    0x08, 0x00, 0x00, 0x00,
    0x01, 0x00,
    0x12, 0x01, 0x03, 0x00,
    0x01, 0x00, 0x00, 0x00,
    orientation, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]);
  const length = payload.length + 2;
  const segment = new Uint8Array(payload.length + 4);
  segment.set([0xff, 0xe1, (length >> 8) & 0xff, length & 0xff]);
  segment.set(payload, 4);
  const bytes = new Uint8Array(base.length + segment.length);
  bytes.set(base.slice(0, 2));
  bytes.set(segment, 2);
  bytes.set(base.slice(2), 2 + segment.length);
  return bytes.buffer;
}

test('accepts PNG metadata with a matching PNG signature', () => {
  const result = validateFileMetadata({
    name: 'card.png',
    type: 'image/png',
    size: 1024,
    header: pngHeader(1080, 1080),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.image, { format: 'png', width: 1080, height: 1080 });
});

test('accepts .jpeg but explicitly rejects .jpg even when bytes are valid JPEG', () => {
  const header = jpegHeader(1200, 800);
  const jpeg = validateFileMetadata({ name: 'photo.jpeg', type: 'image/jpeg', size: 2048, header });
  const upperJpeg = validateFileMetadata({ name: 'PHOTO.JPEG', type: 'image/jpeg', size: 2048, header });
  const jpg = validateFileMetadata({ name: 'photo.jpg', type: 'image/jpeg', size: 2048, header });
  const upperJpg = validateFileMetadata({ name: 'PHOTO.JPG', type: 'image/jpeg', size: 2048, header });

  assert.equal(jpeg.ok, true);
  assert.equal(upperJpeg.ok, true);
  assert.equal(jpg.ok, false);
  assert.equal(jpg.code, 'UNSUPPORTED_EXTENSION');
  assert.match(jpg.message, /\.jpg/);
  assert.equal(upperJpg.ok, false);
});

test('rejects unsupported extensions before trusting MIME or signature', () => {
  const result = validateFileMetadata({
    name: 'image.webp',
    type: 'image/png',
    size: 100,
    header: pngHeader(100, 100),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'UNSUPPORTED_EXTENSION');
});

test('rejects extension and MIME mismatches', () => {
  const result = validateFileMetadata({
    name: 'image.png',
    type: 'image/jpeg',
    size: 100,
    header: pngHeader(100, 100),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'MIME_MISMATCH');
});

test('rejects extension and signature mismatches', () => {
  const result = validateFileMetadata({
    name: 'image.png',
    type: 'image/png',
    size: 100,
    header: jpegHeader(100, 100),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'SIGNATURE_MISMATCH');
});

test('reads all valid JPEG EXIF orientation values and defaults safely', () => {
  for (let orientation = 1; orientation <= 8; orientation += 1) {
    assert.equal(inspectExifOrientation(jpegWithExifOrientation(480, 320, orientation)), orientation);
  }
  assert.equal(inspectExifOrientation(jpegWithLittleEndianExifOrientation(480, 320, 8)), 8);
  assert.equal(inspectExifOrientation(jpegHeader(480, 320)), 1);
  assert.equal(inspectExifOrientation(Uint8Array.from([0xff, 0xd8, 0xff]).buffer), 1);
});

test('parses PNG and JPEG dimensions without decoding the bitmap', () => {
  assert.deepEqual(inspectImageHeader(pngHeader(640, 480)), { format: 'png', width: 640, height: 480 });
  assert.deepEqual(inspectImageHeader(jpegHeader(1920, 1080)), { format: 'jpeg', width: 1920, height: 1080 });
});

test('rejects malformed or truncated image headers', () => {
  assert.equal(inspectImageHeader(Uint8Array.from([0x89, 0x50]).buffer), null);
  const result = validateFileMetadata({
    name: 'broken.jpeg',
    type: 'image/jpeg',
    size: 2,
    header: Uint8Array.from([0xff, 0xd8]).buffer,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_IMAGE');
});

test('rejects files over the compressed size limit', () => {
  const result = validateFileMetadata({
    name: 'huge.png',
    type: 'image/png',
    size: FILE_LIMIT_BYTES + 1,
    header: pngHeader(100, 100),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'FILE_TOO_LARGE');
});

test('rejects decompression-bomb-like pixel dimensions', () => {
  const width = Math.ceil(Math.sqrt(PIXEL_LIMIT)) + 1;
  const result = validateFileMetadata({
    name: 'huge.png',
    type: 'image/png',
    size: 1024,
    header: pngHeader(width, width),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'DIMENSIONS_TOO_LARGE');
});

test('accepts a valid signature when the browser leaves MIME type empty', () => {
  const result = validateFileMetadata({
    name: 'camera.jpeg',
    type: '',
    size: 2048,
    header: jpegHeader(1200, 800),
  });
  assert.equal(result.ok, true);
});

test('rejects a PNG with a malformed IHDR length before decode', () => {
  const header = new Uint8Array(pngHeader(100, 100));
  header[11] = 0x0c;
  const result = validateFileMetadata({
    name: 'broken.png',
    type: 'image/png',
    size: 100,
    header: header.buffer,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_IMAGE');
});
