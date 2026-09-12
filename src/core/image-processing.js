import { validateImageFile } from './file-validation.js';

const MAX_WORKING_EDGE = 4096;

export class ImageInputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ImageInputError';
    this.code = code;
  }
}

function targetDimensions(width, height) {
  const scale = Math.min(1, MAX_WORKING_EDGE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function decodeWithImageBitmap(file, expected, orientation = 1) {
  const target = targetDimensions(expected.width, expected.height);
  const swapsAxes = orientation >= 5 && orientation <= 8;
  const resizeWidth = swapsAxes ? target.height : target.width;
  const resizeHeight = swapsAxes ? target.width : target.height;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image',
      resizeWidth,
      resizeHeight,
      resizeQuality: 'high',
    });
  } catch {
    bitmap = await createImageBitmap(file);
  }

  const scale = Math.min(1, MAX_WORKING_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) {
    bitmap.close();
    throw new ImageInputError('DECODE_FAILED', '브라우저에서 이미지 캔버스를 초기화하지 못했습니다.');
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas;
}

async function decodeWithImageElement(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    const target = targetDimensions(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new ImageInputError('DECODE_FAILED', '브라우저에서 이미지 캔버스를 초기화하지 못했습니다.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, target.width, target.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepareImageFile(file) {
  const validation = await validateImageFile(file);
  if (!validation.ok) throw new ImageInputError(validation.code, validation.message);

  try {
    const canvas = typeof createImageBitmap === 'function'
      ? await decodeWithImageBitmap(file, validation.image, validation.orientation)
      : await decodeWithImageElement(file);
    if (!canvas.width || !canvas.height) {
      throw new ImageInputError('DECODE_FAILED', '이미지를 디코딩하지 못했습니다.');
    }
    return {
      canvas,
      format: validation.image.format,
      originalWidth: validation.image.width,
      originalHeight: validation.image.height,
    };
  } catch (error) {
    if (error instanceof ImageInputError) throw error;
    throw new ImageInputError('DECODE_FAILED', '이미지가 손상되었거나 브라우저에서 디코딩할 수 없습니다.');
  }
}
