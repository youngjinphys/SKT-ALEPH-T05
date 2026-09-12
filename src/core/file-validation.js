export const FILE_LIMIT_BYTES = 30 * 1024 * 1024;
export const PIXEL_LIMIT = 32_000_000;

const EXTENSION_FORMAT = new Map([
  ['.png', 'png'],
  ['.jpeg', 'jpeg'],
]);

const MIME_FORMAT = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpeg'],
]);

function extensionOf(name) {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index).toLowerCase() : '';
}

function readPngDimensions(bytes) {
  if (bytes.length < 24) return null;
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[index] !== signature[index]) return null;
  }
  if (bytes[8] !== 0x00 || bytes[9] !== 0x00 || bytes[10] !== 0x00 || bytes[11] !== 0x0d) return null;
  if (String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (!width || !height) return null;
  return { format: 'png', width, height };
}

const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3,
  0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb,
  0xcd, 0xce, 0xcf,
]);

function readJpegDimensions(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 3 < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;

    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) break;

    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;

    if (SOF_MARKERS.has(marker)) {
      if (segmentLength < 7) return null;
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      if (!width || !height) return null;
      return { format: 'jpeg', width, height };
    }
    offset += segmentLength;
  }
  return null;
}

export function inspectImageHeader(header) {
  const bytes = header instanceof Uint8Array ? header : new Uint8Array(header);
  return readPngDimensions(bytes) ?? readJpegDimensions(bytes);
}


function readEndianUint16(bytes, offset, littleEndian) {
  if (offset < 0 || offset + 2 > bytes.length) return null;
  return littleEndian
    ? bytes[offset] | (bytes[offset + 1] << 8)
    : (bytes[offset] << 8) | bytes[offset + 1];
}

function readEndianUint32(bytes, offset, littleEndian) {
  if (offset < 0 || offset + 4 > bytes.length) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 4);
  return view.getUint32(0, littleEndian);
}

function orientationFromExifSegment(bytes, payloadStart, payloadEnd) {
  if (payloadEnd - payloadStart < 14) return 1;
  const exif = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
  for (let index = 0; index < exif.length; index += 1) {
    if (bytes[payloadStart + index] !== exif[index]) return 1;
  }

  const tiffStart = payloadStart + 6;
  const byteOrderA = bytes[tiffStart];
  const byteOrderB = bytes[tiffStart + 1];
  const littleEndian = byteOrderA === 0x49 && byteOrderB === 0x49;
  const bigEndian = byteOrderA === 0x4d && byteOrderB === 0x4d;
  if (!littleEndian && !bigEndian) return 1;
  if (readEndianUint16(bytes, tiffStart + 2, littleEndian) !== 0x2a) return 1;

  const ifdRelativeOffset = readEndianUint32(bytes, tiffStart + 4, littleEndian);
  if (ifdRelativeOffset === null) return 1;
  const ifdStart = tiffStart + ifdRelativeOffset;
  if (ifdStart < tiffStart || ifdStart + 2 > payloadEnd) return 1;
  const entryCount = readEndianUint16(bytes, ifdStart, littleEndian);
  if (entryCount === null) return 1;

  for (let index = 0; index < entryCount; index += 1) {
    const entry = ifdStart + 2 + index * 12;
    if (entry + 12 > payloadEnd) return 1;
    const tag = readEndianUint16(bytes, entry, littleEndian);
    if (tag !== 0x0112) continue;
    const type = readEndianUint16(bytes, entry + 2, littleEndian);
    const count = readEndianUint32(bytes, entry + 4, littleEndian);
    if (type !== 3 || count !== 1) return 1;
    const orientation = readEndianUint16(bytes, entry + 8, littleEndian);
    return orientation >= 1 && orientation <= 8 ? orientation : 1;
  }
  return 1;
}

export function inspectExifOrientation(header) {
  const bytes = header instanceof Uint8Array ? header : new Uint8Array(header);
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;

  let offset = 2;
  while (offset + 3 < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;

    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) break;

    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return 1;
    if (marker === 0xe1) {
      const orientation = orientationFromExifSegment(bytes, offset + 2, offset + segmentLength);
      if (orientation !== 1) return orientation;
    }
    offset += segmentLength;
  }
  return 1;
}

function failure(code, message) {
  return { ok: false, code, message };
}

export function validateFileMetadata({ name, type, size, header }) {
  const extension = extensionOf(name);
  const extensionFormat = EXTENSION_FORMAT.get(extension);
  if (!extensionFormat) {
    const jpgDetail = extension === '.jpg' ? ' .jpg 파일은 지원하지 않습니다.' : '';
    return failure(
      'UNSUPPORTED_EXTENSION',
      `지원하지 않는 확장자입니다.${jpgDetail} PNG(.png) 또는 JPEG(.jpeg) 파일을 사용해 주세요.`,
    );
  }

  if (size > FILE_LIMIT_BYTES) {
    return failure('FILE_TOO_LARGE', '파일이 너무 큽니다. 30MB 이하 이미지를 사용해 주세요.');
  }

  const normalizedType = (type || '').toLowerCase();
  const mimeFormat = normalizedType ? MIME_FORMAT.get(normalizedType) : null;
  if (normalizedType && mimeFormat !== extensionFormat) {
    return failure('MIME_MISMATCH', '파일 확장자와 브라우저가 인식한 이미지 형식이 일치하지 않습니다.');
  }

  const image = inspectImageHeader(header);
  if (!image) {
    return failure('INVALID_IMAGE', '이미지 헤더가 손상되었거나 읽을 수 없습니다.');
  }
  if (image.format !== extensionFormat) {
    return failure('SIGNATURE_MISMATCH', '파일 확장자와 실제 이미지 형식이 일치하지 않습니다.');
  }

  if (image.width * image.height > PIXEL_LIMIT) {
    return failure('DIMENSIONS_TOO_LARGE', '이미지 해상도가 너무 큽니다. 총 3,200만 픽셀 이하 이미지를 사용해 주세요.');
  }

  return { ok: true, image };
}

export async function validateImageFile(file) {
  const header = await file.slice(0, Math.min(file.size, 512 * 1024)).arrayBuffer();
  const result = validateFileMetadata({
    name: file.name,
    type: file.type,
    size: file.size,
    header,
  });
  return {
    ...result,
    orientation: result.ok && result.image.format === 'jpeg' ? inspectExifOrientation(header) : 1,
  };
}
