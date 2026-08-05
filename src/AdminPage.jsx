import { useState } from 'react';
import { supabase } from './supabaseClient';

function AdminPage({ onBack, onViewTools }) {
  const [name, setName] = useState('');
  const [serial, setSerial] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [scanning, setScanning] = useState(false);

  const handleAddTool = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const { error } = await supabase
      .from('tools')
      .insert({
        id: serial.trim(),
        name: name.trim(),
        is_checked_out: false,
        condition: 'Ready',
      });

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: `Added "${name}" successfully.` });
      setName('');
      setSerial('');
    }
    setSaving(false);
  };

  const handleImageCapture = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  setScanning(true);
  setMessage(null);

  try {
    const resizedBase64 = await resizeImage(file, 1024); // max 1024px on the longest side

    const response = await fetch('/api/analyze-tool', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: resizedBase64, mediaType: 'image/jpeg' }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to analyze image');
    }

    setName(result.name || '');
    setSerial(result.serial || '');
    setMessage({
      type: 'info',
      text: 'Detected — please review and correct below before saving.',
    });
  } catch (err) {
    setMessage({ type: 'error', text: 'AI scan failed: ' + err.message });
  }

  setScanning(false);
};

// Resizes an image file down to maxDimension on its longest side,
// returns just the base64 data (no data URL prefix), as JPEG.
const resizeImage = (file, maxDimension) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.onload = () => {
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

        const dataUrl = canvas.toDataURL('image/jpeg', 0.8); // 0.8 = decent quality, smaller size
        resolve(dataUrl.split(',')[1]);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

  return (
    <div>
      <h1>Admin: Add Tool</h1>
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
        <button onClick={onBack}>← Back to Scanner</button>
        <button onClick={onViewTools}>View Tools</button>
      </div>

      <form onSubmit={handleAddTool} style={{ maxWidth: '400px' }}>
        <label>Tool Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          style={{ display: 'block', width: '100%', padding: '0.5rem', marginBottom: '1rem' }}
        />

        <label>Serial Number</label>
        <input
          type="text"
          value={serial}
          onChange={(e) => setSerial(e.target.value)}
          required
          style={{ display: 'block', width: '100%', padding: '0.5rem', marginBottom: '0.5rem' }}
        />

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'inline-block', padding: '0.5rem 1rem', border: '1px solid #ccc', cursor: 'pointer' }}>
            {scanning ? 'Analyzing photo...' : '🤖 Scan Tool with AI'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImageCapture}
              disabled={scanning}
              style={{ display: 'none' }}
            />
          </label>
        </div>

        <button type="submit" disabled={saving}>
          {saving ? 'Adding...' : 'Add Tool'}
        </button>
      </form>

      {message && (
        <p style={{ color: message.type === 'error' ? 'red' : message.type === 'info' ? '#666' : 'green', marginTop: '1rem' }}>
          {message.text}
        </p>
      )}
    </div>
  );
}

export default AdminPage;