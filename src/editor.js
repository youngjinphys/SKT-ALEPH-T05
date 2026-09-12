import { focalFromTransform, getCoverTransform, getOutputSize } from './core/document.js';
import { getTextMetrics, renderDocument } from './core/renderer.js';

const HANDLE_SIZE = 42;
const HIT_PADDING = 18;

function clone(value) {
  return structuredClone(value);
}

function sameDocument(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export class CanvasEditor {
  constructor({ canvas, inlineEditor, onSelectionChange, onTransientChange, onCommitFrom }) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.inlineEditor = inlineEditor;
    this.onSelectionChange = onSelectionChange;
    this.onTransientChange = onTransientChange;
    this.onCommitFrom = onCommitFrom;
    this.document = null;
    this.background = null;
    this.selectedId = null;
    this.mode = 'text';
    this.gesture = null;
    this.inlineBaseline = null;
    this.lastMetrics = new Map();

    canvas.addEventListener('pointerdown', (event) => this.handlePointerDown(event));
    canvas.addEventListener('pointermove', (event) => this.handlePointerMove(event));
    canvas.addEventListener('pointerup', (event) => this.finishGesture(event));
    canvas.addEventListener('pointercancel', (event) => this.finishGesture(event));
    canvas.addEventListener('dblclick', (event) => this.handleDoubleClick(event));
    inlineEditor.addEventListener('input', () => this.handleInlineInput());
    inlineEditor.addEventListener('blur', () => this.finishInlineEditing());
    inlineEditor.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') inlineEditor.blur();
    });
  }

  setState(doc, background) {
    this.document = doc;
    this.background = background;
    const { width, height } = getOutputSize(doc.aspectRatio);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    if (this.selectedId && !doc.textLayers.some((layer) => layer.id === this.selectedId)) {
      this.select(null);
    }
    this.render();
  }

  get outputSize() {
    return { width: this.canvas.width || 1080, height: this.canvas.height || 1080 };
  }

  setMode(mode) {
    this.mode = mode;
    this.finishInlineEditing();
    this.canvas.dataset.mode = mode;
    this.render();
  }

  select(id) {
    if (this.selectedId === id) return;
    this.finishInlineEditing();
    this.selectedId = id;
    this.onSelectionChange(id);
    this.render();
  }

  render() {
    if (!this.document || !this.context) return;
    const skipTextId = this.inlineEditor.hidden ? null : this.selectedId;
    this.lastMetrics = renderDocument(this.context, this.document, this.background, { skipTextId });
    if (this.mode === 'text' && this.selectedId && this.inlineEditor.hidden) {
      const layer = this.document.textLayers.find((item) => item.id === this.selectedId);
      if (layer) {
        const metrics = getTextMetrics(this.context, layer, this.canvas.width, this.canvas.height);
        this.drawSelection(metrics);
      }
    }
  }

  drawSelection(metrics) {
    const ctx = this.context;
    ctx.save();
    ctx.strokeStyle = '#5b7cff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 8]);
    ctx.strokeRect(metrics.left, metrics.top, metrics.maxWidth, metrics.height);
    ctx.setLineDash([]);
    const half = HANDLE_SIZE / 2;
    ctx.fillRect(metrics.right - half, metrics.bottom - half, HANDLE_SIZE, HANDLE_SIZE);
    ctx.strokeRect(metrics.right - half, metrics.bottom - half, HANDLE_SIZE, HANDLE_SIZE);
    ctx.restore();
  }

  pointFromEvent(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (this.canvas.width / rect.width),
      y: (event.clientY - rect.top) * (this.canvas.height / rect.height),
    };
  }

  hitHandle(point, metrics) {
    return Math.abs(point.x - metrics.right) <= HANDLE_SIZE && Math.abs(point.y - metrics.bottom) <= HANDLE_SIZE;
  }

  hitText(point) {
    if (!this.document) return null;
    for (let index = this.document.textLayers.length - 1; index >= 0; index -= 1) {
      const layer = this.document.textLayers[index];
      const metrics = getTextMetrics(this.context, layer, this.canvas.width, this.canvas.height);
      if (
        point.x >= metrics.left - HIT_PADDING && point.x <= metrics.right + HIT_PADDING
        && point.y >= metrics.top - HIT_PADDING && point.y <= metrics.bottom + HIT_PADDING
      ) return { layer, metrics };
    }
    return null;
  }

  handlePointerDown(event) {
    if (!this.document || !this.background) return;
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const point = this.pointFromEvent(event);
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events and a few embedded browsers may not expose an active pointer to capture.
    }

    if (this.mode === 'background') {
      const transform = getCoverTransform({
        imageWidth: this.background.width,
        imageHeight: this.background.height,
        canvasWidth: this.canvas.width,
        canvasHeight: this.canvas.height,
        ...this.document.background,
      });
      this.gesture = {
        type: 'background',
        pointerId: event.pointerId,
        start: point,
        baseline: clone(this.document),
        transform,
      };
      return;
    }

    if (this.selectedId) {
      const selected = this.document.textLayers.find((layer) => layer.id === this.selectedId);
      if (selected) {
        const metrics = getTextMetrics(this.context, selected, this.canvas.width, this.canvas.height);
        if (this.hitHandle(point, metrics)) {
          this.gesture = {
            type: 'resize',
            pointerId: event.pointerId,
            start: point,
            baseline: clone(this.document),
            layerId: selected.id,
            initialDistance: Math.max(1, Math.hypot(point.x - metrics.centerX, point.y - metrics.centerY)),
          };
          return;
        }
      }
    }

    const hit = this.hitText(point);
    if (!hit) {
      this.select(null);
      return;
    }
    this.selectedId = hit.layer.id;
    this.onSelectionChange(hit.layer.id);
    this.gesture = {
      type: 'move',
      pointerId: event.pointerId,
      start: point,
      baseline: clone(this.document),
      layerId: hit.layer.id,
    };
    this.render();
  }

  handlePointerMove(event) {
    if (!this.gesture || event.pointerId !== this.gesture.pointerId) return;
    const point = this.pointFromEvent(event);
    const next = clone(this.gesture.baseline);

    if (this.gesture.type === 'move') {
      const layer = next.textLayers.find((item) => item.id === this.gesture.layerId);
      const base = this.gesture.baseline.textLayers.find((item) => item.id === this.gesture.layerId);
      layer.x = Math.min(1, Math.max(0, base.x + (point.x - this.gesture.start.x) / this.canvas.width));
      layer.y = Math.min(1, Math.max(0, base.y + (point.y - this.gesture.start.y) / this.canvas.height));
    } else if (this.gesture.type === 'resize') {
      const layer = next.textLayers.find((item) => item.id === this.gesture.layerId);
      const base = this.gesture.baseline.textLayers.find((item) => item.id === this.gesture.layerId);
      const centerX = base.x * this.canvas.width;
      const centerY = base.y * this.canvas.height;
      const distance = Math.max(1, Math.hypot(point.x - centerX, point.y - centerY));
      const scale = Math.min(4, Math.max(0.25, distance / this.gesture.initialDistance));
      layer.width = Math.min(1, Math.max(0.05, base.width * scale));
      layer.fontSize = Math.min(0.25, Math.max(0.015, base.fontSize * scale));
    } else if (this.gesture.type === 'background') {
      const dx = point.x - this.gesture.start.x;
      const dy = point.y - this.gesture.start.y;
      const t = this.gesture.transform;
      const x = Math.min(0, Math.max(this.canvas.width - t.drawWidth, t.x + dx));
      const y = Math.min(0, Math.max(this.canvas.height - t.drawHeight, t.y + dy));
      Object.assign(next.background, focalFromTransform({
        x,
        y,
        drawWidth: t.drawWidth,
        drawHeight: t.drawHeight,
        canvasWidth: this.canvas.width,
        canvasHeight: this.canvas.height,
      }));
    }

    this.document = next;
    this.onTransientChange(next);
    this.render();
  }

  finishGesture(event) {
    if (!this.gesture || event.pointerId !== this.gesture.pointerId) return;
    const { baseline } = this.gesture;
    const next = clone(this.document);
    this.gesture = null;
    if (!sameDocument(baseline, next)) this.onCommitFrom(baseline, next);
    this.render();
  }

  handleDoubleClick(event) {
    if (this.mode !== 'text' || !this.document) return;
    const hit = this.hitText(this.pointFromEvent(event));
    if (!hit) return;
    this.selectedId = hit.layer.id;
    this.onSelectionChange(hit.layer.id);
    this.beginInlineEditing();
  }

  beginInlineEditing() {
    if (!this.selectedId || !this.document) return;
    const layer = this.document.textLayers.find((item) => item.id === this.selectedId);
    if (!layer) return;
    const metrics = getTextMetrics(this.context, layer, this.canvas.width, this.canvas.height);
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = rect.width / this.canvas.width;
    const scaleY = rect.height / this.canvas.height;
    this.inlineBaseline = clone(this.document);
    this.inlineEditor.value = layer.text;
    this.inlineEditor.style.left = `${metrics.left * scaleX}px`;
    this.inlineEditor.style.top = `${metrics.top * scaleY}px`;
    this.inlineEditor.style.width = `${metrics.maxWidth * scaleX}px`;
    this.inlineEditor.style.minHeight = `${Math.max(48, metrics.height * scaleY)}px`;
    this.inlineEditor.style.font = `${layer.fontWeight} ${metrics.fontSize * scaleX}px/${layer.lineHeight} ${layer.fontFamily}`;
    this.inlineEditor.style.color = layer.color;
    this.inlineEditor.style.textAlign = layer.textAlign;
    this.inlineEditor.hidden = false;
    this.inlineEditor.focus();
    this.inlineEditor.select();
    this.render();
  }

  handleInlineInput() {
    if (!this.document || !this.selectedId) return;
    const next = clone(this.document);
    const layer = next.textLayers.find((item) => item.id === this.selectedId);
    if (!layer) return;
    layer.text = this.inlineEditor.value;
    this.document = next;
    this.onTransientChange(next);
    this.render();
  }

  finishInlineEditing() {
    if (this.inlineEditor.hidden) return;
    const baseline = this.inlineBaseline;
    const next = clone(this.document);
    this.inlineEditor.hidden = true;
    this.inlineBaseline = null;
    if (baseline && !sameDocument(baseline, next)) this.onCommitFrom(baseline, next);
    this.render();
  }
}
