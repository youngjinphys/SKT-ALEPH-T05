function splitLongToken(token, maxWidth, measure) {
  const chunks = [];
  let current = '';
  for (const character of token) {
    const candidate = current + character;
    if (current && measure(candidate) > maxWidth) {
      chunks.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current || token === '') chunks.push(current);
  return chunks;
}

function wrapParagraph(paragraph, maxWidth, measure) {
  if (paragraph === '') return [''];
  const words = paragraph.split(/\s+/u);
  const lines = [];
  let line = '';

  for (const word of words) {
    if (!word) continue;
    const pieces = measure(word) > maxWidth ? splitLongToken(word, maxWidth, measure) : [word];
    for (const piece of pieces) {
      const candidate = line ? `${line} ${piece}` : piece;
      if (!line || measure(candidate) <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = piece;
      }
    }
  }
  if (line || lines.length === 0) lines.push(line);
  return lines;
}

export function wrapText(text, maxWidth, measure) {
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) throw new TypeError('maxWidth must be positive.');
  if (typeof measure !== 'function') throw new TypeError('measure must be a function.');
  return String(text).split('\n').flatMap((paragraph) => wrapParagraph(paragraph, maxWidth, measure));
}
