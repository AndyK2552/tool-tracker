import { useEffect, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { supabase } from './supabaseClient';

function QrTest() {
  const [tool, setTool] = useState(null);
  const [error, setError] = useState(null);
  const [techName, setTechName] = useState('');

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
    if (!techName.trim()) {
      alert('Please enter a tech name');
      return;
    }

    const { data, error } = await supabase
      .from('tools')
      .update({
        is_checked_out: true,
        checked_out_by: techName.trim(),
        checked_out_at: new Date().toISOString(),
      })
      .eq('id', tool.id)
      .select()
      .single();

    if (error) {
      alert('Error checking out tool: ' + error.message);
    } else {
      setTool(data);
      setTechName('');
    }
  };

  const handleReturn = async () => {
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
    alert('Error returning tool: ' + JSON.stringify(error));
  } else if (!data) {
    alert('Update ran but no data came back — check RLS or ID match.');
  } else {
    alert('Success! New state: ' + JSON.stringify(data));
    setTool(data);
  }
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
    } else {
      setTool(data);
    }
  };

  return (
    <div>
      <h1>QR Scanner Test</h1>
      <div id="qr-reader" style={{ width: '100%' }}></div>

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
              <input
                type="text"
                placeholder="Tech name"
                value={techName}
                onChange={(e) => setTechName(e.target.value)}
                style={{ marginRight: '0.5rem', padding: '0.5rem' }}
              />
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