export const ASPECT_RATIOS = Object.freeze({
  '1:1': Object.freeze({ width: 1080, height: 1080, label: '1:1' }),
  '4:5': Object.freeze({ width: 1080, height: 1350, label: '4:5' }),
  '9:16': Object.freeze({ width: 1080, height: 1920, label: '9:16' }),
});

export function getOutputSize(aspectRatio) {
  const size = ASPECT_RATIOS[aspectRatio];
  if (!size) throw new TypeError(`Unknown aspect ratio: ${aspectRatio}`);
  return { width: size.width, height: size.height };
}

export function createDocument(aspectRatio = '1:1') {
  getOutputSize(aspectRatio);
  return {
    version: 1,
    aspectRatio,
    background: {
      focalX: 0.5,
      focalY: 0.5,
      zoom: 1,
    },
    textLayers: [],
  };
}

let nextTextId = 1;
export function createTextLayer(text = '문구를 입력하세요') {
  return {
    id: `text-${Date.now().toString(36)}-${nextTextId++}`,
    text,
    x: 0.5,
    y: 0.5,
    width: 0.72,
    fontSize: 0.065,
    color: '#ffffff',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontWeight: 700,
    textAlign: 'center',
    lineHeight: 1.18,
  };
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function getCoverTransform({
  imageWidth,
  imageHeight,
  canvasWidth,
  canvasHeight,
  focalX = 0.5,
  focalY = 0.5,
  zoom = 1,
}) {
  if ([imageWidth, imageHeight, canvasWidth, canvasHeight].some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new TypeError('Image and canvas dimensions must be positive finite numbers.');
  }
  const safeZoom = clamp(Number.isFinite(zoom) ? zoom : 1, 1, 4);
  const coverScale = Math.max(canvasWidth / imageWidth, canvasHeight / imageHeight);
  const scale = coverScale * safeZoom;
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;

  const desiredX = canvasWidth / 2 - clamp(focalX, 0, 1) * drawWidth;
  const desiredY = canvasHeight / 2 - clamp(focalY, 0, 1) * drawHeight;
  const x = clamp(desiredX, canvasWidth - drawWidth, 0);
  const y = clamp(desiredY, canvasHeight - drawHeight, 0);

  return { x, y, drawWidth, drawHeight, scale };
}

export function focalFromTransform({ x, y, drawWidth, drawHeight, canvasWidth, canvasHeight }) {
  return {
    focalX: clamp((canvasWidth / 2 - x) / drawWidth, 0, 1),
    focalY: clamp((canvasHeight / 2 - y) / drawHeight, 0, 1),
  };
}

export function movePointByPixels(point, dx, dy, canvasSize) {
  return {
    x: clamp(point.x + dx / canvasSize.width, 0, 1),
    y: clamp(point.y + dy / canvasSize.height, 0, 1),
  };
}

export function resizeTextLayer(layer, { width = layer.width, fontSize = layer.fontSize }) {
  return {
    ...layer,
    width: clamp(width, 0.05, 1),
    fontSize: clamp(fontSize, 0.015, 0.25),
  };
}
