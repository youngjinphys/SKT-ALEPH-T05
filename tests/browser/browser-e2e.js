import { prepareImageFile } from '../../src/core/image-processing.js';

const failures = [];
let assertions = 0;

function assert(condition, message) {
  assertions += 1;
  if (!condition) failures.push(message);
}

async function waitFor(predicate, message, timeout = 5000) {
  const started = performance.now();
  while (performance.now() - started < timeout) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out: ${message}`);
}

async function createImageFile(format, name, width = 640, height = 480) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2347d8';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#f7d354';
  ctx.fillRect(width / 3, height / 3, width / 3, height / 3);
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, 0.9));
  return new File([blob], name, { type: mime });
}

async function withExifOrientation(file, orientation = 6) {
  const source = new Uint8Array(await file.arrayBuffer());
  const payload = Uint8Array.from([
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // Exif\0\0
    0x4d, 0x4d, 0x00, 0x2a,             // big-endian TIFF
    0x00, 0x00, 0x00, 0x08,             // first IFD offset
    0x00, 0x01,                           // one IFD entry
    0x01, 0x12, 0x00, 0x03,             // Orientation, SHORT
    0x00, 0x00, 0x00, 0x01,             // count = 1
    0x00, orientation, 0x00, 0x00,       // value
    0x00, 0x00, 0x00, 0x00,             // next IFD
  ]);
  const segmentLength = payload.length + 2;
  const app1 = new Uint8Array(payload.length + 4);
  app1.set([0xff, 0xe1, (segmentLength >> 8) & 0xff, segmentLength & 0xff], 0);
  app1.set(payload, 4);
  const combined = new Uint8Array(source.length + app1.length);
  combined.set(source.slice(0, 2), 0);
  combined.set(app1, 2);
  combined.set(source.slice(2), 2 + app1.length);
  return new File([combined], 'rotated.jpeg', { type: 'image/jpeg' });
}

function structurallyIncompleteJpeg(name = 'broken.jpeg', width = 640, height = 480) {
  const bytes = Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
  return new File([bytes], name, { type: 'image/jpeg' });
}

function redCentroid(canvas) {
  const ctx = canvas.getContext('2d');
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const index = (y * width + x) * 4;
      if (data[index] > 200 && data[index + 1] < 110 && data[index + 2] < 160 && data[index + 3] > 200) {
        sumX += x;
        sumY += y;
        count += 1;
      }
    }
  }
  return count ? { x: sumX / count, y: sumY / count, count } : null;
}

function yellowCentroid(canvas) {
  const ctx = canvas.getContext('2d');
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let y = 0; y < height; y += 3) {
    for (let x = 0; x < width; x += 3) {
      const index = (y * width + x) * 4;
      if (data[index] > 220 && data[index + 1] > 170 && data[index + 2] < 130 && data[index + 3] > 200) {
        sumX += x;
        sumY += y;
        count += 1;
      }
    }
  }
  return count ? { x: sumX / count, y: sumY / count, count } : null;
}

function selectionBlueCount(canvas) {
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  let count = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index] >= 70 && data[index] <= 120 && data[index + 1] >= 90 && data[index + 1] <= 155 && data[index + 2] >= 235 && data[index + 3] > 200) count += 1;
  }
  return count;
}

function setFile(input, file) {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function dropFile(target, file) {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
}

async function run() {
  await waitFor(() => document.body.dataset.appReady === 'true', 'app ready');

  assert(document.querySelector('[data-ratio="1:1"]'), '1:1 ratio control exists');
  assert(document.querySelector('[data-ratio="4:5"]'), '4:5 ratio control exists');
  assert(document.querySelector('[data-ratio="9:16"]'), '9:16 ratio control exists');
  assert(document.querySelector('#file-input')?.accept === '.png,.jpeg', 'file input only advertises .png and .jpeg');

  const unrotatedJpeg = await createImageFile('jpeg', 'orientation-source.jpeg', 480, 320);
  const rotatedJpeg = await withExifOrientation(unrotatedJpeg, 6);
  const browserOriented = await createImageBitmap(rotatedJpeg, { imageOrientation: 'from-image' });
  assert(browserOriented.width === 320 && browserOriented.height === 480, `browser orientation decode works (got ${browserOriented.width}x${browserOriented.height})`);
  browserOriented.close();
  const oriented = await prepareImageFile(rotatedJpeg);
  assert(oriented.canvas.width === 320 && oriented.canvas.height === 480, `EXIF orientation is normalized before editing (got ${oriented.canvas.width}x${oriented.canvas.height})`);

  const jpg = await createImageFile('jpeg', 'blocked.jpg');
  setFile(document.querySelector('#file-input'), jpg);
  await waitFor(() => document.querySelector('#error-message')?.textContent.includes('.jpg'), '.jpg rejection');
  assert(document.querySelector('#editor-shell').hidden, '.jpg does not open the editor');

  const gifLike = new File([new Uint8Array([0x47, 0x49, 0x46, 0x38])], 'blocked.gif', { type: 'image/gif' });
  setFile(document.querySelector('#file-input'), gifLike);
  await waitFor(() => document.querySelector('#error-message')?.textContent.includes('지원하지 않는 확장자'), 'unsupported extension rejection');

  setFile(document.querySelector('#file-input'), structurallyIncompleteJpeg());
  await waitFor(() => document.querySelector('#error-message')?.textContent.includes('손상'), 'decode failure rejection');
  assert(document.querySelector('#editor-shell').hidden, 'a header-only JPEG cannot enter the editor');

  const png = await createImageFile('png', 'fixture.png');
  dropFile(document.querySelector('#drop-zone'), png);
  await waitFor(() => !document.querySelector('#editor-shell').hidden, 'valid PNG dropped onto the upload zone opens editor');
  assert(document.querySelector('#error-message').textContent === '', 'valid upload clears previous error');
  assert(document.querySelector('#status-message').textContent.includes('브라우저'), 'privacy status is visible after load');

  document.querySelector('[data-ratio="9:16"]').click();
  assert(document.querySelector('#output-size').textContent.includes('1080 × 1920'), '9:16 reports exact export size');
  document.querySelector('#undo').click();
  assert(document.querySelector('#output-size').textContent.includes('1080 × 1080'), 'undo restores the previous aspect ratio');
  document.querySelector('#redo').click();
  assert(document.querySelector('#output-size').textContent.includes('1080 × 1920'), 'redo reapplies the aspect ratio');

  document.querySelector('#add-text').click();
  await waitFor(() => !document.querySelector('#text-inspector').hidden, 'text inspector visible');
  const textArea = document.querySelector('#text-content');
  textArea.focus();
  textArea.value = '브라우저 통합 테스트';
  textArea.dispatchEvent(new Event('input', { bubbles: true }));
  textArea.blur();
  assert(!document.querySelector('#undo').disabled, 'text edit creates undo history');

  const color = document.querySelector('#text-color');
  color.value = '#ff3366';
  color.dispatchEvent(new Event('change', { bubbles: true }));
  assert(color.value === '#ff3366', 'text color changes through inspector');
  const font = document.querySelector('#text-font');
  assert(font, 'font family control exists');
  if (font) {
    font.value = 'serif';
    font.dispatchEvent(new Event('change', { bubbles: true }));
    assert(font.value === 'serif', 'font family changes through inspector');
  }

  const editorCanvas = document.querySelector('#editor-canvas');
  const beforeDrag = redCentroid(editorCanvas);
  assert(beforeDrag && beforeDrag.count > 5, 'colored text is rendered on the canvas');
  const canvasRect = editorCanvas.getBoundingClientRect();
  const startX = canvasRect.left + canvasRect.width / 2;
  const startY = canvasRect.top + canvasRect.height / 2;
  const pointerOptions = { bubbles: true, pointerId: 41, pointerType: 'mouse', button: 0 };
  editorCanvas.dispatchEvent(new PointerEvent('pointerdown', { ...pointerOptions, clientX: startX, clientY: startY }));
  editorCanvas.dispatchEvent(new PointerEvent('pointermove', { ...pointerOptions, clientX: startX + 42, clientY: startY }));
  editorCanvas.dispatchEvent(new PointerEvent('pointerup', { ...pointerOptions, clientX: startX + 42, clientY: startY }));
  const afterDrag = redCentroid(editorCanvas);
  assert(afterDrag && afterDrag.x > beforeDrag.x + 20, 'dragging a text layer moves it on the canvas');

  const scaleX = canvasRect.width / editorCanvas.width;
  const scaleY = canvasRect.height / editorCanvas.height;
  const handleX = startX + 42 + (0.72 * editorCanvas.width / 2) * scaleX;
  const handleY = startY + (0.065 * editorCanvas.width * 1.18 / 2) * scaleY;
  const resizePointer = { bubbles: true, pointerId: 47, pointerType: 'mouse', button: 0 };
  editorCanvas.dispatchEvent(new PointerEvent('pointerdown', { ...resizePointer, clientX: handleX, clientY: handleY }));
  editorCanvas.dispatchEvent(new PointerEvent('pointermove', { ...resizePointer, clientX: handleX + 28, clientY: handleY + 20 }));
  editorCanvas.dispatchEvent(new PointerEvent('pointerup', { ...resizePointer, clientX: handleX + 28, clientY: handleY + 20 }));
  const afterResize = redCentroid(editorCanvas);
  assert(afterResize && afterResize.count > afterDrag.count * 1.08, 'dragging the selection handle resizes the text layer');

  editorCanvas.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: startX + 42, clientY: startY }));
  await waitFor(() => !document.querySelector('#inline-text-editor').hidden, 'inline text editor opens on double click');
  const inlineEditor = document.querySelector('#inline-text-editor');
  inlineEditor.value = '캔버스 직접 편집';
  inlineEditor.dispatchEvent(new Event('input', { bubbles: true }));
  inlineEditor.blur();
  assert(document.querySelector('#text-content').value === '캔버스 직접 편집', 'inline edit stays synchronized with inspector');

  document.querySelector('#undo').click();
  document.querySelector('#redo').click();
  assert(document.querySelector('#layers-list').children.length === 1, 'undo/redo keeps the text layer recoverable');
  const restoredLayerButton = document.querySelector('#layers-list .layer-button');
  restoredLayerButton?.click();
  assert(document.querySelector('#text-content').value === '캔버스 직접 편집', 'redo restores the latest inline text edit');

  document.querySelector('#add-text-side').click();
  assert(document.querySelector('#layers-list').children.length === 2, 'multiple text layers can be added');
  window.__ALEPH_XSS_PROBE__ = 0;
  const untrustedText = document.querySelector('#text-content');
  untrustedText.focus();
  untrustedText.value = '<img src=x onerror="window.__ALEPH_XSS_PROBE__=1">';
  untrustedText.dispatchEvent(new Event('input', { bubbles: true }));
  untrustedText.blur();
  assert(!document.querySelector('#layers-list img'), 'user text is rendered as text rather than injected HTML');
  assert(window.__ALEPH_XSS_PROBE__ === 0, 'user text cannot execute an inline HTML payload');
  document.querySelector('#delete-text').click();
  assert(document.querySelector('#layers-list').children.length === 1, 'the selected text layer can be deleted');

  document.querySelector('#crop-mode').click();
  assert(document.querySelector('#crop-mode').getAttribute('aria-pressed') === 'true', 'background crop mode toggles on');
  document.querySelector('#add-text').click();
  assert(document.querySelector('#crop-mode').getAttribute('aria-pressed') === 'false', 'adding text exits background crop mode');
  document.querySelector('#delete-text').click();
  document.querySelector('#crop-mode').click();
  document.querySelector('#layers-list .layer-button')?.click();
  assert(document.querySelector('#crop-mode').getAttribute('aria-pressed') === 'false', 'selecting a text layer exits background crop mode');
  document.querySelector('#crop-mode').click();
  const zoom = document.querySelector('#image-zoom');
  zoom.value = '1.4';
  zoom.dispatchEvent(new Event('change', { bubbles: true }));
  assert(Number(zoom.value) === 1.4, 'background zoom can be adjusted');

  const beforeCropDrag = yellowCentroid(editorCanvas);
  const cropRect = editorCanvas.getBoundingClientRect();
  const cropX = cropRect.left + cropRect.width / 2;
  const cropY = cropRect.top + cropRect.height / 2;
  const cropPointer = { bubbles: true, pointerId: 52, pointerType: 'touch', button: 0 };
  editorCanvas.dispatchEvent(new PointerEvent('pointerdown', { ...cropPointer, clientX: cropX, clientY: cropY }));
  editorCanvas.dispatchEvent(new PointerEvent('pointermove', { ...cropPointer, clientX: cropX + 36, clientY: cropY }));
  editorCanvas.dispatchEvent(new PointerEvent('pointerup', { ...cropPointer, clientX: cropX + 36, clientY: cropY }));
  const afterCropDrag = yellowCentroid(editorCanvas);
  assert(beforeCropDrag && afterCropDrag && afterCropDrag.x > beforeCropDrag.x + 30, 'dragging in crop mode repositions the background image');
  document.querySelector('#undo').click();
  const afterCropUndo = yellowCentroid(editorCanvas);
  assert(afterCropUndo && Math.abs(afterCropUndo.x - beforeCropDrag.x) < 8, 'undo restores the previous crop position');
  document.querySelector('#redo').click();

  let capturedLink = null;
  const originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function interceptedClick() {
    capturedLink = { href: this.href, download: this.download };
  };
  try {
    document.querySelector('#export-format').value = 'png';
    document.querySelector('#export-format').dispatchEvent(new Event('change', { bubbles: true }));
    assert(getComputedStyle(document.querySelector('#jpeg-quality-row')).display === 'none', 'JPEG quality control is hidden for PNG export');
    document.querySelector('#export-image').click();
    await waitFor(() => capturedLink, 'PNG export link');
    const exportedBlob = await fetch(capturedLink.href).then((response) => response.blob());
    const bitmap = await createImageBitmap(exportedBlob);
    assert(bitmap.width === 1080 && bitmap.height === 1920, 'PNG export uses exact 9:16 dimensions');
    assert(capturedLink.download.endsWith('.png'), 'PNG export filename has .png extension');
    bitmap.close();
    URL.revokeObjectURL(capturedLink.href);

    capturedLink = null;
    document.querySelector('#export-format').value = 'jpeg';
    document.querySelector('#export-format').dispatchEvent(new Event('change', { bubbles: true }));
    assert(getComputedStyle(document.querySelector('#jpeg-quality-row')).display !== 'none', 'JPEG quality control is visible for JPEG export');
    document.querySelector('#export-image').click();
    await waitFor(() => capturedLink, 'JPEG export link');
    const jpegBlob = await fetch(capturedLink.href).then((response) => response.blob());
    const jpegBitmap = await createImageBitmap(jpegBlob);
    assert(jpegBitmap.width === 1080 && jpegBitmap.height === 1920, 'JPEG export uses exact 9:16 dimensions');
    assert(capturedLink.download.endsWith('.jpeg'), 'JPEG export filename has .jpeg extension');
    jpegBitmap.close();
    URL.revokeObjectURL(capturedLink.href);

    const transparentCanvas = document.createElement('canvas');
    transparentCanvas.width = 320;
    transparentCanvas.height = 320;
    const transparentContext = transparentCanvas.getContext('2d');
    transparentContext.fillStyle = '#00aa66';
    transparentContext.fillRect(110, 110, 100, 100);
    const transparentBlob = await new Promise((resolve) => transparentCanvas.toBlob(resolve, 'image/png'));
    const transparentFile = new File([transparentBlob], 'transparent.png', { type: 'image/png' });
    setFile(document.querySelector('#file-input'), transparentFile);
    await waitFor(() => document.querySelector('#error-message').textContent === '' && !document.querySelector('#export-image').disabled, 'transparent PNG accepted');

    capturedLink = null;
    document.querySelector('#export-format').value = 'jpeg';
    document.querySelector('#export-format').dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#export-image').click();
    await waitFor(() => capturedLink, 'transparent PNG JPEG export link');
    const flattenedJpegBlob = await fetch(capturedLink.href).then((response) => response.blob());
    const cornerBitmap = await createImageBitmap(flattenedJpegBlob, 0, 0, 1, 1);
    const pixelCanvas = document.createElement('canvas');
    pixelCanvas.width = 1;
    pixelCanvas.height = 1;
    const pixelContext = pixelCanvas.getContext('2d');
    pixelContext.drawImage(cornerBitmap, 0, 0);
    const corner = pixelContext.getImageData(0, 0, 1, 1).data;
    assert(corner[0] > 245 && corner[1] > 245 && corner[2] > 245, 'JPEG export flattens transparent pixels onto white');
    cornerBitmap.close();
    URL.revokeObjectURL(capturedLink.href);
  } finally {
    HTMLAnchorElement.prototype.click = originalClick;
  }

  const validJpeg = await createImageFile('jpeg', 'replacement.jpeg');
  setFile(document.querySelector('#file-input'), validJpeg);
  await waitFor(() => document.querySelector('#error-message').textContent === '' && !document.querySelector('#export-image').disabled, 'valid .jpeg replacement accepted');
  assert(!document.querySelector('#editor-shell').hidden, '.jpeg remains in editor');
  assert(document.querySelector('#undo').disabled, 'replacing the source image establishes a clean undo baseline');
  assert(selectionBlueCount(editorCanvas) < 100, 'replacing the source image clears stale canvas selection chrome');

  const replacementJpg = await createImageFile('jpeg', 'still-blocked.jpg');
  setFile(document.querySelector('#file-input'), replacementJpg);
  await waitFor(() => document.querySelector('#error-message')?.textContent.includes('.jpg'), 'replacement .jpg rejection');
  assert(!document.querySelector('#editor-shell').hidden, 'invalid replacement does not destroy the current document');

  const finalPng = await createImageFile('png', 'final.png');
  setFile(document.querySelector('#file-input'), finalPng);
  await waitFor(() => document.querySelector('#error-message').textContent === '' && !document.querySelector('#export-image').disabled, 'final valid image restores clean state');
  if (document.querySelector('#crop-mode').getAttribute('aria-pressed') === 'true') document.querySelector('#crop-mode').click();
  assert(selectionBlueCount(editorCanvas) < 100, 'image replacement leaves no stale text selection when returning to text mode');
  document.querySelector('#export-format').value = 'png';
  document.querySelector('#export-format').dispatchEvent(new Event('change', { bubbles: true }));

  const remainingLayer = document.querySelector('#layers-list .layer-button');
  remainingLayer?.click();
  document.querySelector('#delete-text').click();
  document.querySelector('#add-text').click();
  const previewText = document.querySelector('#text-content');
  previewText.focus();
  previewText.value = '미리보기 문구';
  previewText.dispatchEvent(new Event('input', { bubbles: true }));
  previewText.blur();
  const finalRect = editorCanvas.getBoundingClientRect();
  editorCanvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 77, pointerType: 'mouse', button: 0, clientX: finalRect.left + 5, clientY: finalRect.top + 5 }));
  editorCanvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 77, pointerType: 'mouse', button: 0, clientX: finalRect.left + 5, clientY: finalRect.top + 5 }));
  assert(document.querySelector('#text-inspector').hidden, 'clicking empty canvas clears the text selection');
  window.scrollTo(0, 0);

  assert(document.documentElement.scrollWidth <= window.innerWidth + 1, 'desktop layout has no horizontal overflow');

  return { status: failures.length === 0 ? 'pass' : 'fail', assertions, failures };
}

try {
  window.__ALEPH_TEST_RESULTS__ = await run();
} catch (error) {
  window.__ALEPH_TEST_RESULTS__ = {
    status: 'fail',
    assertions,
    failures: [...failures, error.stack || error.message],
  };
}
