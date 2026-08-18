import { useRef, useState } from 'react';
import { resizeImage } from './imageUtils';

// Wires a hidden native-camera file input to a resize+callback pipeline.
// The returned `open()` must be called synchronously from a click handler —
// browsers only allow the camera picker to open in direct response to a user gesture.
export function useCameraCapture(onCapture) {
  const inputRef = useRef(null);
  const [error, setError] = useState(null);

  const open = () => {
    setError(null);
    inputRef.current?.click();
  };

  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const base64 = await resizeImage(file, 1024);
      onCapture(base64);
    } catch {
      setError('Could not read that photo. Please try again.');
    }
  };

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      capture="environment"
      onChange={handleChange}
      style={{ display: 'none' }}
    />
  );

  return { open, error, input };
}
