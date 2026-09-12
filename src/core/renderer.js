import { getCoverTransform, getOutputSize } from './document.js';
import { wrapText } from './text-layout.js';

export function getTextMetrics(context, layer, canvasWidth, canvasHeight) {
  const fontSize = layer.fontSize * canvasWidth;
  const maxWidth = layer.width * canvasWidth;
  context.font = `${layer.fontWeight} ${fontSize}px ${layer.fontFamily}`;
  const lines = wrapText(layer.text, maxWidth, (text) => context.measureText(text).width);
  const lineHeight = fontSize * layer.lineHeight;
  const height = Math.max(lineHeight, lines.length * lineHeight);
  const centerX = layer.x * canvasWidth;
  const centerY = layer.y * canvasHeight;
  return {
    fontSize,
    maxWidth,
    lines,
    lineHeight,
    height,
    left: centerX - maxWidth / 2,
    top: centerY - height / 2,
    right: centerX + maxWidth / 2,
    bottom: centerY + height / 2,
    centerX,
    centerY,
  };
}

export function drawTextLayer(context, layer, canvasWidth, canvasHeight) {
  const metrics = getTextMetrics(context, layer, canvasWidth, canvasHeight);
  context.save();
  context.font = `${layer.fontWeight} ${metrics.fontSize}px ${layer.fontFamily}`;
  context.fillStyle = layer.color;
  context.textBaseline = 'top';
  context.textAlign = layer.textAlign;
  context.lineJoin = 'round';

  let drawX = metrics.centerX;
  if (layer.textAlign === 'left') drawX = metrics.left;
  if (layer.textAlign === 'right') drawX = metrics.right;

  metrics.lines.forEach((line, index) => {
    context.fillText(line, drawX, metrics.top + index * metrics.lineHeight, metrics.maxWidth);
  });
  context.restore();
  return metrics;
}

export function renderDocument(context, doc, backgroundCanvas, { skipTextId = null, clear = true } = {}) {
  const { width, height } = context.canvas;
  if (clear) context.clearRect(0, 0, width, height);

  if (backgroundCanvas) {
    const transform = getCoverTransform({
      imageWidth: backgroundCanvas.width,
      imageHeight: backgroundCanvas.height,
      canvasWidth: width,
      canvasHeight: height,
      focalX: doc.background.focalX,
      focalY: doc.background.focalY,
      zoom: doc.background.zoom,
    });
    context.save();
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(backgroundCanvas, transform.x, transform.y, transform.drawWidth, transform.drawHeight);
    context.restore();
  }

  const metrics = new Map();
  for (const layer of doc.textLayers) {
    if (layer.id === skipTextId) continue;
    metrics.set(layer.id, drawTextLayer(context, layer, width, height));
  }
  return metrics;
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('브라우저가 이미지 파일을 생성하지 못했습니다.'));
    }, type, quality);
  });
}

export async function renderDocumentToBlob(doc, backgroundCanvas, format = 'png', quality = 0.92) {
  const { width, height } = getOutputSize(doc.aspectRatio);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: format === 'png' });
  if (!context) throw new Error('내보내기 캔버스를 초기화하지 못했습니다.');

  if (format === 'jpeg') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
  }
  if (document.fonts?.ready) await document.fonts.ready;
  renderDocument(context, doc, backgroundCanvas, { clear: format !== 'jpeg' });
  return toBlob(canvas, format === 'jpeg' ? 'image/jpeg' : 'image/png', format === 'jpeg' ? quality : undefined);
}
