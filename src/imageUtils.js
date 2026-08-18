// Resizes an image file down to maxDimension on its longest side,
// returns just the base64 data (no data URL prefix), as JPEG.
// Uses an object URL rather than FileReader.readAsDataURL so the full-resolution
// image is never held in memory as a base64 string — important for native-camera
// photos, which can be 8-12MB and crash mobile browsers if loaded that way.
export const resizeImage = (file, maxDimension) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;

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
      ctx.drawImage(img, 0, 0, width, height);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      resolve(dataUrl.split(',')[1]);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    };
    img.src = objectUrl;
  });
};
