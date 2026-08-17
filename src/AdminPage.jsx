import { useState } from 'react';
import { supabase } from './supabaseClient';
import CameraCapture from './CameraCapture';

function AdminPage({ onHome }) {
  const [name, setName] = useState('');
  const [serial, setSerial] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

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
      if (error.code === '23505') {
        setMessage({ type: 'error', text: `A tool with serial number "${serial.trim()}" already exists.` });
      } else {
        setMessage({ type: 'error', text: error.message });
      }
    } else {
      setMessage({ type: 'success', text: `Added "${name}" successfully.` });
      setName('');
      setSerial('');
    }
    setSaving(false);
  };

  const handleAICapture = async (base64) => {
    setScanning(true);
    setMessage(null);

    try {
      const response = await fetch('/api/analyze-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mediaType: 'image/jpeg' }),
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
      setShowCamera(false);
    } catch (err) {
      setMessage({ type: 'error', text: 'AI scan failed: ' + err.message });
    }

    setScanning(false);
  };

  return (
    <div>
      <h1>Admin: Add Tool</h1>
      <div style={{ marginBottom: '1rem' }}>
        <button onClick={onHome}>Home</button>
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
          {showCamera ? (
            <CameraCapture onCapture={handleAICapture} capturing={scanning} label="Capture Tool Label" />
          ) : (
            <button type="button" onClick={() => setShowCamera(true)}>
              🤖 Scan Tool with AI
            </button>
          )}
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