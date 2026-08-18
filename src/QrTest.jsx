import { useEffect, useState, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { supabase } from './supabaseClient';
import { colors } from './theme';
import PageHeader from './PageHeader';

function QrTest({ techProfile }) {
  const [tool, setTool] = useState(null);
  const [error, setError] = useState(null);
  const scannerRef = useRef(null);

  const scanForTool = async (decodedText) => {
    const { data, error } = await supabase.from('tools').select('*').eq('qr_code', decodedText).single();
    if (error || !data) {
      setError(`No tool found for QR code: ${decodedText}`);
      setTool(null);
    } else {
      setTool(data);
      setError(null);
    }
  };

  useEffect(() => {
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
  }, []);

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

  const cardStyle = { background: colors.navyLight, border: `0.5px solid ${colors.navyBorder}`, borderRadius: '8px', padding: '1rem', marginTop: '1rem' };
  const btnStyle = { padding: '0.6rem 1rem', borderRadius: '6px', border: 'none', background: colors.gold, color: colors.navy, fontWeight: 'bold', cursor: 'pointer' };

  return (
    <div style={{ background: colors.navy, minHeight: '100vh' }}>
      <PageHeader title="KYPD Tool Tracker" />

      <div style={{ padding: '1.25rem' }}>
        <h1 style={{ color: colors.white, fontSize: '20px' }}>Check-Out Tool</h1>

        <div style={{ display: tool ? 'none' : 'block' }}>
          <div id="qr-reader" style={{ width: '100%' }}></div>
          <p style={{ fontSize: '0.85rem', color: colors.textMuted, marginTop: '0.75rem' }}>
            Point the camera at the tool's QR code — it'll scan automatically.
          </p>
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