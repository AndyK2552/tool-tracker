// Resizes an image file down to maxDimension on its longest side,
// returns just the base64 data (no data URL prefix), as JPEG.
//
// Prefers createImageBitmap over an <img> element: it decodes off the DOM
// entirely and — critically — lets us call bitmap.close() to free the
// decoded full-resolution bitmap immediately, rather than waiting on
// garbage collection. Native-camera photos can be 12+ megapixels, and on
// memory-constrained Android phones the GC-timing gap was long enough for
// the tab to be killed for out-of-memory before it ever ran.
export const resizeImage = async (file, maxDimension) => {
  if (typeof createImageBitmap === 'function') {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      return drawToJpeg(bitmap, maxDimension);
    } finally {
      bitmap?.close();
    }
  }
  return resizeImageViaImgElement(file, maxDimension);
};

const drawToJpeg = (source, maxDimension) => {
  let { width, height } = source;

  if (width > height && width > maxDimension) {
    height = Math.round((height * maxDimension) / width);
    width = maxDimension;
  } else if (height > maxDimension) {
    width = Math.round((width * maxDimension) / height);
    height = maxDimension;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0, width, height);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  return dataUrl.split(',')[1];
};

// Fallback for browsers without createImageBitmap support.
const resizeImageViaImgElement = (file, maxDimension) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(drawToJpeg(img, maxDimension));
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    };
    img.src = objectUrl;
  });
};
