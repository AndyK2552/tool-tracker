import { useEffect, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { supabase } from './supabaseClient';
import { resizeImage } from './imageUtils';

function QrTest({ techProfile }) {
  const [tool, setTool] = useState(null);
  const [error, setError] = useState(null);
  const [scanningWithAI, setScanningWithAI] = useState(false);

  const handleAIScan = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  setScanningWithAI(true);
  setError(null);

  try {
    const resizedBase64 = await resizeImage(file, 1024);

    const response = await fetch('/api/analyze-tool', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: resizedBase64, mediaType: 'image/jpeg' }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to analyze image');
    }

    if (!result.serial) {
      setError('Could not detect a serial number in that photo. Try again with better lighting or a closer shot.');
    } else {
      await scanForTool(result.serial);
    }
  } catch (err) {
    setError('AI scan failed: ' + err.message);
  }

  setScanningWithAI(false);
};
  const scanForTool = async (decodedText) => {
    const { data, error } = await supabase
      .from('tools')
      .select('*')
      .eq('id', decodedText)
      .single();

    if (error || !data) {
      setError(`No tool found for ID: ${decodedText}`);
      setTool(null);
    } else {
      setTool(data);
      setError(null);
    }
  };

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      'qr-reader',
      {
        fps: 10,
        videoConstraints: {
          facingMode: { exact: 'environment' },
        },
      },
      false
    );

    scanner.render(
      async (decodedText) => {
        scanner.pause();
        await scanForTool(decodedText);
      },
      (error) => {}
    );

    return () => {
      scanner.clear().catch((error) => {
        console.error('Failed to clear scanner', error);
      });
    };
  }, []);

  const handleCheckOut = async () => {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('tools')
    .update({
      is_checked_out: true,
      checked_out_by: techProfile.name,
      checked_out_at: now,
    })
    .eq('id', tool.id)
    .select()
    .single();

  if (error) {
    alert('Error checking out tool: ' + error.message);
    return;
  }

  const { error: historyError } = await supabase
    .from('tool_history')
    .insert({
      tool_name: tool.name,
      tool_id: tool.id,
      action: 'checked_out',
      tech_name: techProfile.name,
      timestamp: now,
    });

  if (historyError) {
    console.error('Failed to log history:', historyError.message);
  }

  setTool(data);
};

const handleReturn = async () => {
  const now = new Date().toISOString();
  const techWhoReturned = tool.checked_out_by; // capture before we clear it

  const { data, error } = await supabase
    .from('tools')
    .update({
      is_checked_out: false,
      checked_out_by: null,
      checked_out_at: null,
    })
    .eq('id', tool.id)
    .select()
    .single();

  if (error) {
    alert('Error returning tool: ' + error.message);
    return;
  }

  // Log this action to history
  const { error: historyError } = await supabase
    .from('tool_history')
    .insert({
      tool_id: tool.id,
      tool_name: tool.name,
      action: 'returned',
      tech_name: techWhoReturned,
      timestamp: now,
    });

  if (historyError) {
    console.error('Failed to log history:', historyError.message);
  }

  setTool(data);
};

  const handleToggleCondition = async () => {
  const newCondition = tool.condition === 'Ready' ? 'Damaged' : 'Ready';

  const { data, error } = await supabase
    .from('tools')
    .update({ condition: newCondition })
    .eq('id', tool.id)
    .select()
    .single();

  if (error) {
    alert('Error updating condition: ' + error.message);
    return;
  }

  // Log this action to history
  const { error: historyError } = await supabase
    .from('tool_history')
    .insert({
      tool_id: tool.id,
      tool_name: tool.name,
      action: 'condition_changed',
      tech_name: tool.checked_out_by,
      timestamp: new Date().toISOString(),
      condition_change: newCondition,
    });

  if (historyError) {
    alert('Failed to log history: ' + JSON.stringify(historyError));
  }

  setTool(data);
};

  return (
    <div>
      <h1>QR Scanner Test</h1>
      <div id="qr-reader" style={{ width: '100%' }}></div>

<div style={{ marginTop: '1rem' }}>
  <label style={{ display: 'inline-block', padding: '0.5rem 1rem', border: '1px solid #ccc', cursor: 'pointer' }}>
    {scanningWithAI ? 'Analyzing photo...' : '🤖 Scan Serial with AI (if QR code is damaged)'}
    <input
      type="file"
      accept="image/*"
      capture="environment"
      onChange={handleAIScan}
      disabled={scanningWithAI}
      style={{ display: 'none' }}
    />
  </label>
</div>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {tool && (
        <div style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ccc' }}>
          <h2>{tool.name}</h2>
          <p><strong>ID:</strong> {tool.id}</p>
          <p><strong>Checked out:</strong> {tool.is_checked_out ? 'Yes' : 'No'}</p>
          <p><strong>Checked out by:</strong> {tool.checked_out_by || '—'}</p>
          <p><strong>Condition:</strong> {tool.condition}</p>

          {!tool.is_checked_out ? (
            <div style={{ marginTop: '1rem' }}>
              <button onClick={handleCheckOut}>Check Out</button>
            </div>
            ) : (
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
              <button onClick={handleReturn}>Return</button>
              <button onClick={handleToggleCondition}>
                Change Condition ({tool.condition === 'Ready' ? 'Mark Damaged' : 'Mark Ready'})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default QrTest;