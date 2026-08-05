import { useState } from 'react';
import { supabase } from './supabaseClient';

function AdminPage({ onBack, onViewTools }) {
  const [name, setName] = useState('');
  const [serial, setSerial] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

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
          style={{ display: 'block', width: '100%', padding: '0.5rem', marginBottom: '1rem' }}
        />

        <button type="submit" disabled={saving}>
          {saving ? 'Adding...' : 'Add Tool'}
        </button>
      </form>

      {message && (
        <p style={{ color: message.type === 'error' ? 'red' : 'green', marginTop: '1rem' }}>
          {message.text}
        </p>
      )}
    </div>
  );
}

export default AdminPage;