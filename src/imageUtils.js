// Resizes an image file down to maxDimension on its longest side,
// returns just the base64 data (no data URL prefix), as JPEG.
//
// Native-camera photos can be 12-50+ megapixels. Decoding one at full
// resolution — even briefly, even with prompt cleanup — is itself enough
// to crash the tab on memory-constrained Android phones. So instead of
// decoding full-size and scaling down after, we ask createImageBitmap to
// downscale *during* decode via resizeWidth: the browser's JPEG decoder
// can scale while decoding (far cheaper than decode-then-scale), so the
// full-resolution bitmap is never actually materialized in memory.
export const resizeImage = async (file, maxDimension) => {
  if (typeof createImageBitmap === 'function') {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file, {
        resizeWidth: Math.max(maxDimension * 2, 1600),
        resizeQuality: 'medium',
      });
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
