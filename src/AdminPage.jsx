import { useState } from 'react';
import { supabase } from './supabaseClient';
import CameraCapture from './CameraCapture';
import PageHeader from './PageHeader';
import { colors, btnStyle, secondaryBtnStyle } from './theme';

function AdminPage({ onHome }) {
  const [name, setName] = useState('');
  const [serial, setSerial] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [showCamera, setShowCamera] = useState(true);

  const handleAddTool = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const { error } = await supabase
      .from('tools')
      .insert({ id: serial.trim(), name: name.trim(), is_checked_out: false, condition: 'Ready' });

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
      if (!response.ok) throw new Error(result.error || 'Failed to analyze image');
      setName(result.name || '');
      setSerial(result.serial || '');
      setMessage({ type: 'info', text: 'Detected — please review and correct below before saving.' });
      setShowCamera(false);
    } catch (err) {
      setMessage({ type: 'error', text: 'AI scan failed: ' + err.message });
    }
    setScanning(false);
  };

  const inputStyle = {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    padding: '0.6rem',
    marginBottom: '1rem',
    borderRadius: '6px',
    border: 'none',
  };


  return (
    <div style={{ background: colors.navy, minHeight: '100vh' }}>
      <PageHeader title="KYPD Tool Tracker" />

      <div style={{ padding: '1.25rem' }}>
        <h1 style={{ color: colors.white, fontSize: '20px' }}>Admin: Add Tool</h1>

        <button onClick={onHome} style={{ ...btnStyle, marginBottom: '1rem' }}>
          Home
        </button>

        <div style={{ marginBottom: '1rem', maxWidth: '400px' }}>
          {showCamera ? (
            <CameraCapture onCapture={handleAICapture} capturing={scanning} label="Capture Tool Label" />
          ) : (
            <button type="button" onClick={() => setShowCamera(true)} style={btnStyle}>
              🤖 Scan Tool
            </button>
          )}
        </div>

        {message && (
          <p
            style={{
              color: message.type === 'error' ? '#ff8080' : message.type === 'info' ? colors.textMuted : '#5FCF7A',
              marginBottom: '1rem',
            }}
          >
            {message.text}
          </p>
        )}

        <form onSubmit={handleAddTool} style={{ maxWidth: '400px' }}>
          <label style={{ color: colors.white, fontSize: '14px' }}>Tool Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={inputStyle}
          />

          <label style={{ color: colors.white, fontSize: '14px' }}>Serial Number</label>
          <input
            type="text"
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            required
            style={inputStyle}
          />

          <button type="submit" disabled={saving} style={btnStyle}>
            {saving ? 'Adding...' : 'Add Tool'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AdminPage;