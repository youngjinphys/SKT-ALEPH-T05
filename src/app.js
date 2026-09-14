import { createDocument, createTextLayer, getOutputSize, movePointByPixels } from './core/document.js';
import { History } from './core/history.js';
import { ImageInputError, prepareImageFile } from './core/image-processing.js';
import { getLayerMoveState, moveLayerBackward, moveLayerForward } from './core/layer-order.js';
import { renderDocumentToBlob } from './core/renderer.js';
import { CanvasEditor } from './editor.js';

function clone(value) {
  return structuredClone(value);
}

function sameDocument(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function required(root, selector) {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`Required UI element missing: ${selector}`);
  return element;
}

export class AppController {
  constructor(root = document) {
    this.root = root;
    this.doc = createDocument('1:1');
    this.history = new History(this.doc);
    this.background = null;
    this.selectedId = null;
    this.inspectorBaseline = null;
    this.zoomBaseline = null;
    this.busy = false;

    this.elements = {
      body: root.body ?? document.body,
      fileInput: required(root, '#file-input'),
      dropZone: required(root, '#drop-zone'),
      emptyState: required(root, '#empty-state'),
      editorShell: required(root, '#editor-shell'),
      canvas: required(root, '#editor-canvas'),
      canvasWrap: required(root, '#canvas-wrap'),
      inlineEditor: required(root, '#inline-text-editor'),
      error: required(root, '#error-message'),
      status: required(root, '#status-message'),
      outputSize: required(root, '#output-size'),
      addText: required(root, '#add-text'),
      addTextSide: required(root, '#add-text-side'),
      cropMode: required(root, '#crop-mode'),
      imageZoom: required(root, '#image-zoom'),
      resetCrop: required(root, '#reset-crop'),
      undo: required(root, '#undo'),
      redo: required(root, '#redo'),
      textInspector: required(root, '#text-inspector'),
      textContent: required(root, '#text-content'),
      textColor: required(root, '#text-color'),
      textSize: required(root, '#text-size'),
      textFont: required(root, '#text-font'),
      textWeight: required(root, '#text-weight'),
      textAlign: required(root, '#text-align'),
      moveBackward: required(root, '#move-layer-backward'),
      moveForward: required(root, '#move-layer-forward'),
      deleteText: required(root, '#delete-text'),
      layersList: required(root, '#layers-list'),
      exportFormat: required(root, '#export-format'),
      jpegQualityRow: required(root, '#jpeg-quality-row'),
      jpegQuality: required(root, '#jpeg-quality'),
      exportImage: required(root, '#export-image'),
    };

    this.editor = new CanvasEditor({
      canvas: this.elements.canvas,
      inlineEditor: this.elements.inlineEditor,
      onSelectionChange: (id) => {
        this.selectedId = id;
        this.updateInspector();
        this.updateLayers();
      },
      onTransientChange: (next) => this.replaceDocument(next),
      onCommitFrom: (base, next) => this.commitFrom(base, next),
    });

    this.bindEvents();
    this.updateAll();
    this.elements.body.dataset.appReady = 'true';
  }

  bindEvents() {
    const e = this.elements;
    e.fileInput.addEventListener('change', () => {
      const file = e.fileInput.files?.[0];
      if (file) this.loadFile(file);
      e.fileInput.value = '';
    });

    for (const eventName of ['dragenter', 'dragover']) {
      e.dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        e.dropZone.dataset.dragging = 'true';
      });
    }
    for (const eventName of ['dragleave', 'drop']) {
      e.dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        e.dropZone.dataset.dragging = 'false';
      });
    }
    e.dropZone.addEventListener('drop', (event) => {
      const file = event.dataTransfer?.files?.[0];
      if (file) this.loadFile(file);
    });

    this.root.querySelectorAll('[data-ratio]').forEach((button) => {
      button.addEventListener('click', () => this.setAspectRatio(button.dataset.ratio));
    });

    e.addText.addEventListener('click', () => this.addText());
    e.addTextSide.addEventListener('click', () => this.addText());
    e.moveBackward.addEventListener('click', () => this.moveSelectedLayerBackward());
    e.moveForward.addEventListener('click', () => this.moveSelectedLayerForward());
    e.deleteText.addEventListener('click', () => this.deleteSelectedText());
    e.undo.addEventListener('click', () => this.undo());
    e.redo.addEventListener('click', () => this.redo());
    e.cropMode.addEventListener('click', () => this.toggleCropMode());
    e.resetCrop.addEventListener('click', () => this.resetCrop());

    e.imageZoom.addEventListener('pointerdown', () => { this.zoomBaseline = clone(this.doc); });
    e.imageZoom.addEventListener('focus', () => { if (!this.zoomBaseline) this.zoomBaseline = clone(this.doc); });
    e.imageZoom.addEventListener('input', () => {
      const next = clone(this.doc);
      next.background.zoom = Number(e.imageZoom.value);
      this.replaceDocument(next);
    });
    e.imageZoom.addEventListener('change', () => {
      const next = clone(this.doc);
      next.background.zoom = Number(e.imageZoom.value);
      if (this.zoomBaseline && !sameDocument(this.zoomBaseline, next)) this.commitFrom(this.zoomBaseline, next);
      else this.commitDocument(next);
      this.zoomBaseline = null;
    });

    e.textContent.addEventListener('focus', () => { this.inspectorBaseline = clone(this.doc); });
    e.textContent.addEventListener('input', () => this.updateSelectedText({ text: e.textContent.value }, false));
    e.textContent.addEventListener('blur', () => this.finishInspectorEdit());
    e.textColor.addEventListener('change', () => this.updateSelectedText({ color: e.textColor.value }, true));
    e.textSize.addEventListener('change', () => {
      const px = Math.min(270, Math.max(16, Number(e.textSize.value) || 16));
      this.updateSelectedText({ fontSize: px / 1080 }, true);
    });
    e.textFont.addEventListener('change', () => this.updateSelectedText({ fontFamily: e.textFont.value }, true));
    e.textWeight.addEventListener('change', () => this.updateSelectedText({ fontWeight: Number(e.textWeight.value) }, true));
    e.textAlign.addEventListener('change', () => this.updateSelectedText({ textAlign: e.textAlign.value }, true));

    e.exportFormat.addEventListener('change', () => this.updateExportControls());
    e.exportImage.addEventListener('click', () => this.exportImage());

    document.addEventListener('keydown', (event) => this.handleKeydown(event));
  }

  async loadFile(file) {
    if (this.busy) return;
    this.setError('');
    this.setStatus('이미지를 확인하는 중…');
    this.setBusy(true);
    try {
      const prepared = await prepareImageFile(file);
      this.background = prepared.canvas;
      if (!this.elements.editorShell.hidden) {
        const next = clone(this.doc);
        next.background = { focalX: 0.5, focalY: 0.5, zoom: 1 };
        this.doc = next;
        this.history = new History(next);
      } else {
        this.doc = createDocument(this.doc.aspectRatio);
        this.history = new History(this.doc);
      }
      this.selectedId = null;
      this.editor.selectedId = null;
      this.elements.emptyState.hidden = true;
      this.elements.editorShell.hidden = false;
      this.editor.setState(this.doc, this.background);
      this.setStatus('이미지는 이 브라우저 안에서만 처리됩니다.');
      this.updateAll();
    } catch (error) {
      const message = error instanceof ImageInputError ? error.message : '이미지를 불러오는 중 오류가 발생했습니다.';
      this.setError(message);
      this.setStatus(this.background ? '기존 편집 내용은 유지되었습니다.' : '지원되는 이미지를 선택해 주세요.');
    } finally {
      this.setBusy(false);
    }
  }

  setBusy(value) {
    this.busy = value;
    this.elements.fileInput.disabled = value;
    this.elements.exportImage.disabled = value || !this.background;
    this.elements.body.setAttribute('aria-busy', String(value));
  }

  setError(message) {
    this.elements.error.textContent = message;
    this.elements.error.hidden = !message;
  }

  setStatus(message) {
    this.elements.status.textContent = message;
  }

  replaceDocument(next) {
    this.doc = this.history.replace(next);
    this.editor.setState(this.doc, this.background);
    this.updateAll();
  }

  commitDocument(next) {
    if (sameDocument(this.doc, next)) return;
    this.doc = this.history.commit(next);
    this.editor.setState(this.doc, this.background);
    this.updateAll();
  }

  commitFrom(base, next) {
    if (sameDocument(base, next)) return;
    this.doc = this.history.commitFrom(base, next);
    this.editor.setState(this.doc, this.background);
    this.updateAll();
  }

  setAspectRatio(ratio) {
    if (!ratio || ratio === this.doc.aspectRatio) return;
    getOutputSize(ratio);
    const next = clone(this.doc);
    next.aspectRatio = ratio;
    this.commitDocument(next);
  }

  enterTextMode(status = '문구를 클릭해 선택하세요.') {
    if (this.elements.cropMode.getAttribute('aria-pressed') !== 'true') return;
    this.elements.cropMode.setAttribute('aria-pressed', 'false');
    this.editor.setMode('text');
    this.setStatus(status);
  }

  addText() {
    if (!this.background) return;
    this.enterTextMode('새 문구를 드래그하거나 더블클릭해 편집하세요.');
    const next = clone(this.doc);
    const layer = createTextLayer();
    next.textLayers.push(layer);
    this.selectedId = layer.id;
    this.commitDocument(next);
    this.editor.selectedId = layer.id;
    this.editor.render();
    this.updateInspector();
    this.updateLayers();
  }

  deleteSelectedText() {
    if (!this.selectedId) return;
    const next = clone(this.doc);
    next.textLayers = next.textLayers.filter((layer) => layer.id !== this.selectedId);
    this.selectedId = null;
    this.editor.selectedId = null;
    this.commitDocument(next);
  }

  moveSelectedLayerBackward() {
    if (!this.selectedId) return;
    this.commitDocument(moveLayerBackward(this.doc, this.selectedId));
  }

  moveSelectedLayerForward() {
    if (!this.selectedId) return;
    this.commitDocument(moveLayerForward(this.doc, this.selectedId));
  }

  updateSelectedText(patch, commit) {
    if (!this.selectedId) return;
    const next = clone(this.doc);
    const layer = next.textLayers.find((item) => item.id === this.selectedId);
    if (!layer) return;
    Object.assign(layer, patch);
    if (commit) this.commitDocument(next);
    else this.replaceDocument(next);
  }

  finishInspectorEdit() {
    if (!this.inspectorBaseline) return;
    const base = this.inspectorBaseline;
    this.inspectorBaseline = null;
    if (!sameDocument(base, this.doc)) this.commitFrom(base, this.doc);
  }

  toggleCropMode() {
    const active = this.elements.cropMode.getAttribute('aria-pressed') !== 'true';
    this.elements.cropMode.setAttribute('aria-pressed', String(active));
    this.editor.setMode(active ? 'background' : 'text');
    this.setStatus(active ? '사진을 드래그해 위치를 조정하세요.' : '문구를 클릭해 선택하세요.');
  }

  resetCrop() {
    const next = clone(this.doc);
    next.background = { focalX: 0.5, focalY: 0.5, zoom: 1 };
    this.commitDocument(next);
  }

  undo() {
    if (!this.history.canUndo) return;
    this.doc = this.history.undo();
    this.editor.setState(this.doc, this.background);
    this.updateAll();
  }

  redo() {
    if (!this.history.canRedo) return;
    this.doc = this.history.redo();
    this.editor.setState(this.doc, this.background);
    this.updateAll();
  }

  handleKeydown(event) {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (!this.selectedId || this.editor.mode !== 'text') return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.deleteSelectedText();
      return;
    }
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    const next = clone(this.doc);
    const layer = next.textLayers.find((item) => item.id === this.selectedId);
    const moved = movePointByPixels(layer, direction[0] * step, direction[1] * step, getOutputSize(this.doc.aspectRatio));
    layer.x = moved.x;
    layer.y = moved.y;
    this.commitDocument(next);
  }

  updateAll() {
    this.updateToolbar();
    this.updateInspector();
    this.updateLayers();
    this.updateExportControls();
    if (this.background) this.editor.setState(this.doc, this.background);
  }

  updateToolbar() {
    const size = getOutputSize(this.doc.aspectRatio);
    this.elements.outputSize.textContent = `${size.width} × ${size.height} px 출력`;
    this.root.querySelectorAll('[data-ratio]').forEach((button) => {
      const selected = button.dataset.ratio === this.doc.aspectRatio;
      button.setAttribute('aria-pressed', String(selected));
    });
    this.elements.undo.disabled = !this.history.canUndo;
    this.elements.redo.disabled = !this.history.canRedo;
    this.elements.imageZoom.value = String(this.doc.background.zoom);
  }

  updateInspector() {
    const layer = this.doc.textLayers.find((item) => item.id === this.selectedId);
    this.elements.textInspector.hidden = !layer;
    if (!layer) {
      this.elements.moveBackward.disabled = true;
      this.elements.moveForward.disabled = true;
      return;
    }
    if (document.activeElement !== this.elements.textContent) this.elements.textContent.value = layer.text;
    this.elements.textColor.value = layer.color;
    this.elements.textSize.value = String(Math.round(layer.fontSize * 1080));
    this.elements.textFont.value = layer.fontFamily;
    this.elements.textWeight.value = String(layer.fontWeight);
    this.elements.textAlign.value = layer.textAlign;
    const moveState = getLayerMoveState(this.doc, this.selectedId);
    this.elements.moveBackward.disabled = !moveState.canMoveBackward;
    this.elements.moveForward.disabled = !moveState.canMoveForward;
  }

  updateLayers() {
    const fragment = document.createDocumentFragment();
    for (const [index, layer] of this.doc.textLayers.entries()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'layer-button';
      button.textContent = layer.text.trim().slice(0, 24) || `빈 문구 ${index + 1}`;
      button.setAttribute('aria-pressed', String(layer.id === this.selectedId));
      button.addEventListener('click', () => {
        this.enterTextMode();
        this.selectedId = layer.id;
        this.editor.selectedId = layer.id;
        this.editor.render();
        this.updateInspector();
        this.updateLayers();
      });
      fragment.append(button);
    }
    this.elements.layersList.replaceChildren(fragment);
  }

  updateExportControls() {
    const jpeg = this.elements.exportFormat.value === 'jpeg';
    this.elements.jpegQualityRow.hidden = !jpeg;
    this.elements.exportImage.disabled = this.busy || !this.background;
  }

  async exportImage() {
    if (!this.background || this.busy) return;
    this.setBusy(true);
    this.setError('');
    this.setStatus('고해상도 이미지를 만드는 중…');
    try {
      const format = this.elements.exportFormat.value === 'jpeg' ? 'jpeg' : 'png';
      const quality = Math.min(1, Math.max(0.6, Number(this.elements.jpegQuality.value) || 0.92));
      const blob = await renderDocumentToBlob(this.doc, this.background, format, quality);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      anchor.href = url;
      anchor.download = `aleph-image-${timestamp}.${format === 'jpeg' ? 'jpeg' : 'png'}`;
      anchor.rel = 'noopener';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      this.setStatus('내보내기가 완료되었습니다. 원본 메타데이터는 포함되지 않습니다.');
    } catch {
      this.setError('이미지를 내보내지 못했습니다. 브라우저 메모리를 확인한 뒤 다시 시도해 주세요.');
      this.setStatus('내보내기 실패');
    } finally {
      this.setBusy(false);
    }
  }
}

export function mountApp(root = document) {
  return new AppController(root);
}
