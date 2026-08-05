import { useState } from 'react';
import { supabase } from './supabaseClient';
import Tesseract from 'tesseract.js';

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
      const result = await Tesseract.recognize(file, 'eng');
      const rawText = result.data.text.trim();

      // Serial numbers are usually a single line/token — grab the most
      // "serial-looking" chunk (letters/numbers, no spaces) as a starting guess
      const cleaned = rawText.replace(/\s+/g, ' ').trim();

      setSerial(cleaned);
      setMessage({
        type: 'info',
        text: 'Text detected — please review and correct below before saving.',
      });
    } catch (err) {
      setMessage({ type: 'error', text: 'OCR failed: ' + err.message });
    }

    setScanning(false);
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
            {scanning ? 'Reading image...' : '📷 Scan Serial with OCR'}
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