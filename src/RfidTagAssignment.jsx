import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import PageHeader from './PageHeader';
import { colors, btnStyle, secondaryBtnStyle } from './theme';

// Reads held on the trigger fire repeated identical scans a few times a
// second -- ignore an exact repeat of the last scan within this window
// rather than hitting Supabase (and showing a confusing "already assigned")
// for every duplicate read of the same tag/QR code.
const DUPLICATE_SCAN_WINDOW_MS = 1500;

function RfidTagAssignment({ onHome }) {
  const [step, setStep] = useState('scanTool'); // 'scanTool' | 'scanTags'
  const [buffer, setBuffer] = useState('');
  const [currentTool, setCurrentTool] = useState(null);
  const [currentTags, setCurrentTags] = useState([]);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const inputRef = useRef(null);
  const lastScanRef = useRef({ value: null, time: 0 });

  useEffect(() => {
    inputRef.current?.focus();
  }, [step]);

  const handleScanTool = async (qrCode) => {
    const { data, error } = await supabase.from('tools').select('id, name, qr_code').eq('qr_code', qrCode).single();
    if (error || !data) {
      setMessage({ type: 'error', text: `No tool found for QR code "${qrCode}".` });
      return;
    }
    const { data: tagRows } = await supabase.from('tool_rfid_tags').select('tag_id').eq('tool_id', data.id);
    setCurrentTool(data);
    setCurrentTags((tagRows || []).map((r) => r.tag_id));
    setMessage(null);
    setStep('scanTags');
  };

  const handleScanTag = async (tagId) => {
    if (currentTags.includes(tagId)) {
      setMessage({ type: 'info', text: `Tag ${tagId} is already assigned to ${currentTool.name}.` });
      return;
    }

    const { error } = await supabase.from('tool_rfid_tags').insert({ tag_id: tagId, tool_id: currentTool.id });
    if (error) {
      if (error.code === '23505') {
        setMessage({ type: 'error', text: `Tag ${tagId} is already assigned to a different tool.` });
      } else {
        setMessage({ type: 'error', text: error.message });
      }
      return;
    }
    setCurrentTags((prev) => [...prev, tagId]);
    setMessage({ type: 'success', text: `Added tag ${tagId}.` });
  };

  const handleRemoveTag = async (tagId) => {
    const { error } = await supabase.from('tool_rfid_tags').delete().eq('tag_id', tagId);
    if (error) {
      setMessage({ type: 'error', text: error.message });
      return;
    }
    setCurrentTags((prev) => prev.filter((t) => t !== tagId));
  };

  const processScan = async (raw) => {
    const value = raw.trim();
    if (!value || busy) return;

    const now = Date.now();
    if (lastScanRef.current.value === value && now - lastScanRef.current.time < DUPLICATE_SCAN_WINDOW_MS) {
      return;
    }
    lastScanRef.current = { value, time: now };

    setBusy(true);
    if (step === 'scanTool') {
      await handleScanTool(value);
    } else {
      await handleScanTag(value);
    }
    setBusy(false);
  };

  const handleKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    processScan(buffer);
    setBuffer('');
  };

  const handleDoneWithTool = () => {
    setCurrentTool(null);
    setCurrentTags([]);
    setMessage(null);
    setBuffer('');
    setStep('scanTool');
  };

  const messageColor = message?.type === 'error' ? '#ff8080' : message?.type === 'success' ? '#5FCF7A' : colors.textMuted;

  return (
    <div style={{ background: colors.navy, minHeight: '100vh' }}>
      <PageHeader title="KYPD Tool Tracker" />

      <div style={{ padding: '1.25rem', maxWidth: '500px', margin: '0 auto' }}>
        <h1 style={{ color: colors.white, fontSize: '20px' }}>Assign RFID Tags</h1>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button onClick={onHome} style={btnStyle}>
            Home
          </button>
        </div>

        {step === 'scanTool' ? (
          <p style={{ color: colors.textMuted, fontSize: '0.85rem', marginBottom: '1rem' }}>
            Put the RFD8500 in barcode mode and scan a tool's QR code to select it.
          </p>
        ) : (
          <div
            style={{
              background: colors.navyLight,
              border: `0.5px solid ${colors.navyBorder}`,
              borderRadius: '8px',
              padding: '10px 12px',
              marginBottom: '1rem',
            }}
          >
            <p style={{ color: colors.gold, fontWeight: 'bold', margin: 0 }}>{currentTool.name}</p>
            <p style={{ color: colors.textMuted, fontSize: '0.8rem', margin: '0.25rem 0 0' }}>
              Switch the RFD8500 to RFID mode and scan each tag to attach it to this tool.
            </p>
          </div>
        )}

        <input
          ref={inputRef}
          type="text"
          value={buffer}
          onChange={(e) => setBuffer(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => inputRef.current?.focus()}
          placeholder={step === 'scanTool' ? 'Scan tool QR code...' : 'Scan RFID tag...'}
          disabled={busy}
          style={{
            width: '100%',
            padding: '0.75rem',
            borderRadius: '6px',
            border: `1px solid ${colors.navyBorder}`,
            background: colors.navyLight,
            color: colors.white,
            fontSize: '1rem',
            boxSizing: 'border-box',
          }}
        />

        {message && <p style={{ color: messageColor, marginTop: '0.75rem' }}>{message.text}</p>}

        {step === 'scanTags' && (
          <>
            <div style={{ marginTop: '1.5rem' }}>
              <p style={{ color: colors.white, fontWeight: 'bold', margin: 0 }}>
                Tags on this tool ({currentTags.length})
              </p>
              {currentTags.length === 0 ? (
                <p style={{ color: colors.textMuted, fontSize: '0.85rem', margin: '0.5rem 0 0' }}>None yet.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0' }}>
                  {currentTags.map((tagId) => (
                    <li
                      key={tagId}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        color: colors.white,
                        fontSize: '0.9rem',
                        padding: '6px 0',
                      }}
                    >
                      {tagId}
                      <button onClick={() => handleRemoveTag(tagId)} style={{ ...secondaryBtnStyle, padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button onClick={handleDoneWithTool} style={{ ...btnStyle, marginTop: '1.25rem' }}>
              Done — scan next tool
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default RfidTagAssignment;
