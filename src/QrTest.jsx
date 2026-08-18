import { useEffect, useState, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { supabase } from './supabaseClient';
import CameraCapture from './CameraCapture';
import { colors } from './theme';
import PageHeader from './PageHeader';

function QrTest({ techProfile }) {
  const [tool, setTool] = useState(null);
  const [error, setError] = useState(null);
  const [scanningWithAI, setScanningWithAI] = useState(false);
  const [mode, setMode] = useState('ai');
  const scannerRef = useRef(null);

  const scanForTool = async (decodedText) => {
    const { data, error } = await supabase.from('tools').select('*').eq('id', decodedText).single();
    if (error || !data) {
      setError(`No tool found for ID: ${decodedText}`);
      setTool(null);
    } else {
      setTool(data);
      setError(null);
    }
  };

  const handleAICapture = async (base64) => {
    setScanningWithAI(true);
    setError(null);
    try {
      const response = await fetch('/api/analyze-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mediaType: 'image/jpeg' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to analyze image');
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

  useEffect(() => {
    if (mode !== 'qr') return;

    const scanner = new Html5QrcodeScanner(
      'qr-reader',
      { fps: 10, videoConstraints: { facingMode: { exact: 'environment' } } },
      false
    );
    scannerRef.current = scanner;

    scanner.render(
      async (decodedText) => {
        scanner.pause();
        await scanForTool(decodedText);
      },
      () => {}
    );

    return () => {
      scanner.clear().catch(() => {});
    };
  }, [mode]);

  const handleCheckOut = async () => {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('tools')
      .update({ is_checked_out: true, checked_out_by: techProfile.name, checked_out_at: now, overdue_alert_sent: false })
      .eq('id', tool.id)
      .select()
      .single();
    if (error) {
      alert('Error checking out tool: ' + error.message);
      return;
    }
    await supabase.from('tool_history').insert({
      tool_name: tool.name, tool_id: tool.id, action: 'checked_out', tech_name: techProfile.name, timestamp: now,
    });
    setTool(data);
  };

  const handleReturn = async () => {
    const now = new Date().toISOString();
    const techWhoReturned = tool.checked_out_by;
    const { data, error } = await supabase
      .from('tools')
      .update({ is_checked_out: false, checked_out_by: null, checked_out_at: null })
      .eq('id', tool.id)
      .select()
      .single();
    if (error) {
      alert('Error returning tool: ' + error.message);
      return;
    }
    await supabase.from('tool_history').insert({
      tool_id: tool.id, tool_name: tool.name, action: 'returned', tech_name: techWhoReturned, timestamp: now,
    });
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
    await supabase.from('tool_history').insert({
      tool_id: tool.id, tool_name: tool.name, action: 'condition_changed', tech_name: tool.checked_out_by,
      timestamp: new Date().toISOString(), condition_change: newCondition,
    });
    setTool(data);
  };

  const resetScan = () => {
    setTool(null);
    setError(null);
    if (scannerRef.current) scannerRef.current.resume();
  };

  const linkStyle = { fontSize: '0.85rem', color: colors.textMuted, background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', padding: 0 };
  const cardStyle = { background: colors.navyLight, border: `0.5px solid ${colors.navyBorder}`, borderRadius: '8px', padding: '1rem', marginTop: '1rem' };
  const btnStyle = { padding: '0.6rem 1rem', borderRadius: '6px', border: 'none', background: colors.gold, color: colors.navy, fontWeight: 'bold', cursor: 'pointer' };

  return (
    <div style={{ background: colors.navy, minHeight: '100vh' }}>
      <PageHeader title="KYPD Tool Tracker" />

      <div style={{ padding: '1.25rem' }}>
        <h1 style={{ color: colors.white, fontSize: '20px' }}>Check-Out Tool</h1>

        <div style={{ display: tool ? 'none' : 'block' }}>
          {mode === 'ai' ? (
            <div>
              <CameraCapture onCapture={handleAICapture} capturing={scanningWithAI} label="Capture Serial Number" />
              <p style={{ marginTop: '0.75rem' }}>
                <button onClick={() => setMode('qr')} style={linkStyle}>Scan QR code instead</button>
              </p>
            </div>
          ) : (
            <div>
              <div id="qr-reader" style={{ width: '100%' }}></div>
              <p style={{ fontSize: '0.85rem', color: colors.textMuted, marginTop: '0.75rem' }}>
                Point the camera at the tool's QR code — it'll scan automatically.
              </p>
              <button onClick={() => setMode('ai')} style={{ ...linkStyle, marginTop: '0.5rem' }}>Use photo scan instead</button>
            </div>
          )}
        </div>

        {tool && (
          <div style={{ textAlign: 'center', padding: '2rem', ...cardStyle }}>
            <div style={{ fontSize: '4rem', color: '#5FCF7A', lineHeight: 1 }}>✅</div>
            <p style={{ color: '#5FCF7A', fontWeight: 'bold', marginTop: '1rem', marginBottom: 0 }}>Tool Found</p>
          </div>
        )}

        {error && <p style={{ color: '#ff8080' }}>{error}</p>}

        {tool && (
          <div style={cardStyle}>
            <h2 style={{ color: colors.white, marginTop: 0 }}>{tool.name}</h2>
            <p style={{ color: colors.textMuted }}><strong style={{ color: colors.white }}>ID:</strong> {tool.id}</p>
            <p style={{ color: colors.textMuted }}><strong style={{ color: colors.white }}>Checked out:</strong> {tool.is_checked_out ? 'Yes' : 'No'}</p>
            <p style={{ color: colors.textMuted }}><strong style={{ color: colors.white }}>Checked out by:</strong> {tool.checked_out_by || '—'}</p>
            <p style={{ color: colors.textMuted }}><strong style={{ color: colors.white }}>Condition:</strong> {tool.condition}</p>

            {!tool.is_checked_out ? (
              <button onClick={handleCheckOut} style={btnStyle}>Check Out</button>
            ) : (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {(techProfile.is_admin || tool.checked_out_by === techProfile.name) ? (
                  <button onClick={handleReturn} style={btnStyle}>Return</button>
                ) : (
                  <button disabled title={`Only ${tool.checked_out_by} or an admin can return this tool`} style={{ ...btnStyle, opacity: 0.5 }}>Return</button>
                )}
                <button onClick={handleToggleCondition} style={{ ...btnStyle, background: colors.navyLight, color: colors.white, border: `0.5px solid ${colors.navyBorder}` }}>
                  Change Condition ({tool.condition === 'Ready' ? 'Mark Damaged' : 'Mark Ready'})
                </button>
              </div>
            )}

            <div style={{ marginTop: '1rem' }}>
              <button onClick={resetScan} style={{ ...btnStyle, background: colors.navyLight, color: colors.white, border: `0.5px solid ${colors.navyBorder}` }}>
                Scan Another Tool
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default QrTest;