import { useEffect, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { supabase } from './supabaseClient';

function QrTest() {
  const [tool, setTool] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      'qr-reader',
      {
        fps: 10,
        qrbox: 250,
        videoConstraints: {
          facingMode: { exact: 'environment' },
        },
      },
      false
    );

    scanner.render(
      async (decodedText) => {
        // Pause scanning once we get a hit, so it doesn't keep firing
        scanner.pause();

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
      },
      (error) => {
        // Fires continuously while no code is found — ignore
      }
    );

    return () => {
      scanner.clear().catch((error) => {
        console.error('Failed to clear scanner', error);
      });
    };
  }, []);

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
        </div>
      )}
    </div>
  );
}

export default QrTest;