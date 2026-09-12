function cloneDocument(doc) {
  return structuredClone(doc);
}

function layerIndex(doc, layerId) {
  if (!doc || !Array.isArray(doc.textLayers)) return -1;
  return doc.textLayers.findIndex((layer) => layer.id === layerId);
}

export function getLayerMoveState(doc, layerId) {
  const index = layerIndex(doc, layerId);
  return {
    canMoveBackward: index > 0,
    canMoveForward: index >= 0 && index < doc.textLayers.length - 1,
  };
}

export function moveLayerForward(doc, layerId) {
  const index = layerIndex(doc, layerId);
  const next = cloneDocument(doc);
  if (index < 0 || index >= next.textLayers.length - 1) return next;

  [next.textLayers[index], next.textLayers[index + 1]] = [
    next.textLayers[index + 1],
    next.textLayers[index],
  ];
  return next;
}
