import { useRef, useState } from 'react';
import { resizeImage } from './imageUtils';
import { colors, btnStyle } from './theme';

function CameraCapture({ onCapture, capturing, label = 'Capture Photo' }) {
  const inputRef = useRef(null);
  const [error, setError] = useState(null);

  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);
    try {
      const base64 = await resizeImage(file, 1024);
      onCapture(base64);
    } catch {
      setError('Could not read that photo. Please try again.');
    }
  };

  return (
    <div>
      {error && <p style={{ color: '#ff8080', fontSize: '0.85rem' }}>{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        style={{ display: 'none' }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={capturing}
        style={{
          ...btnStyle,
          width: '100%',
          opacity: capturing ? 0.6 : 1,
          cursor: capturing ? 'default' : 'pointer',
        }}
      >
        {capturing ? 'Analyzing photo...' : label}
      </button>

      <p style={{ textAlign: 'center', fontSize: '0.8rem', color: colors.textMuted, marginTop: '0.5rem' }}>
        Opens your phone's camera
      </p>
    </div>
  );
}

export default CameraCapture;
