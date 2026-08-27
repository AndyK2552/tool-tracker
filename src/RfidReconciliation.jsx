import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import PageHeader from './PageHeader';
import { colors, btnStyle, secondaryBtnStyle } from './theme';
import { getToolStatus } from './toolStatus';

const EXPECTED_STATUSES = ['Available', 'Pending'];

function RfidReconciliation({ onHome }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toolsById, setToolsById] = useState(new Map());
  const [tagToToolId, setTagToToolId] = useState(new Map());
  const [taggedToolIds, setTaggedToolIds] = useState(new Set());

  const [buffer, setBuffer] = useState('');
  const [scannedToolIds, setScannedToolIds] = useState(new Set());
  const [unknownTagIds, setUnknownTagIds] = useState(new Set());
  const [result, setResult] = useState(null); // null until "Compare" is run

  const inputRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      const [{ data: toolsData, error: toolsErr }, { data: tagsData, error: tagsErr }] = await Promise.all([
        supabase.from('tools').select('id, name, is_checked_out, condition, location'),
        supabase.from('tool_rfid_tags').select('tag_id, tool_id'),
      ]);

      if (toolsErr || tagsErr) {
        setError((toolsErr || tagsErr).message);
        setLoading(false);
        return;
      }

      setToolsById(new Map((toolsData || []).map((t) => [t.id, t])));
      setTagToToolId(new Map((tagsData || []).map((r) => [r.tag_id, r.tool_id])));
      setTaggedToolIds(new Set((tagsData || []).map((r) => r.tool_id)));
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, [loading]);

  const processScan = (rawTagId) => {
    const tagId = rawTagId.trim();
    if (!tagId) return;

    const toolId = tagToToolId.get(tagId);
    if (toolId) {
      setScannedToolIds((prev) => new Set(prev).add(toolId));
    } else {
      setUnknownTagIds((prev) => new Set(prev).add(tagId));
    }
  };

  const handleKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    processScan(buffer);
    setBuffer('');
  };

  const handleReset = () => {
    setScannedToolIds(new Set());
    setUnknownTagIds(new Set());
    setResult(null);
    setBuffer('');
    inputRef.current?.focus();
  };

  const handleCompare = () => {
    const expected = Array.from(toolsById.values()).filter(
      (t) => t.location === 'Shop' && EXPECTED_STATUSES.includes(getToolStatus(t))
    );

    const missingTagged = expected.filter((t) => taggedToolIds.has(t.id) && !scannedToolIds.has(t.id));
    const missingUntagged = expected.filter((t) => !taggedToolIds.has(t.id));
    const unexpected = Array.from(scannedToolIds)
      .filter((id) => !expected.some((t) => t.id === id))
      .map((id) => toolsById.get(id))
      .filter(Boolean);

    setResult({ missingTagged, missingUntagged, unexpected });
  };

  const scannedTools = Array.from(scannedToolIds)
    .map((id) => toolsById.get(id))
    .filter(Boolean);

  const sectionStyle = { marginTop: '1.5rem' };
  const listStyle = { listStyle: 'none', padding: 0, margin: '0.5rem 0 0' };
  const toolRowStyle = { color: colors.white, fontSize: '0.9rem', padding: '4px 0' };

  if (loading) {
    return (
      <div style={{ background: colors.navy, minHeight: '100vh', padding: '1.25rem' }}>
        <p style={{ color: colors.white }}>Loading tools...</p>
      </div>
    );
  }

  return (
    <div style={{ background: colors.navy, minHeight: '100vh' }}>
      <PageHeader title="KYPD Tool Tracker" />

      <div style={{ padding: '1.25rem', maxWidth: '500px', margin: '0 auto' }}>
        <h1 style={{ color: colors.white, fontSize: '20px' }}>RFID Reconciliation</h1>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button onClick={onHome} style={btnStyle}>
            Home
          </button>
          <button onClick={handleReset} style={secondaryBtnStyle}>
            Reset
          </button>
        </div>

        {error && <p style={{ color: '#ff8080' }}>{error}</p>}

        <p style={{ color: colors.textMuted, fontSize: '0.85rem', marginBottom: '1rem' }}>
          Pair the Zebra RFD8500 in Bluetooth HID mode, keep this field focused, and walk the
          shop holding the trigger on every tool. Each read lands here automatically; re-reads of
          the same tag are ignored. When you're done, tap Compare.
        </p>

        <input
          ref={inputRef}
          type="text"
          value={buffer}
          onChange={(e) => setBuffer(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => inputRef.current?.focus()}
          placeholder="Scan here..."
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

        <div style={sectionStyle}>
          <p style={{ color: colors.gold, fontWeight: 'bold', margin: 0 }}>
            Scanned: {scannedTools.length} tool{scannedTools.length === 1 ? '' : 's'}
            {unknownTagIds.size > 0 && (
              <span style={{ color: colors.textMuted, fontWeight: 'normal' }}>
                {' '}
                ({unknownTagIds.size} unknown tag{unknownTagIds.size === 1 ? '' : 's'})
              </span>
            )}
          </p>
          <ul style={listStyle}>
            {scannedTools.map((t) => (
              <li key={t.id} style={toolRowStyle}>
                {t.name}
              </li>
            ))}
          </ul>
        </div>

        <button onClick={handleCompare} style={{ ...btnStyle, marginTop: '1.25rem' }}>
          Compare
        </button>

        {result && (
          <>
            <div style={sectionStyle}>
              <p style={{ color: '#ff8080', fontWeight: 'bold', margin: 0 }}>
                ⚠ Missing ({result.missingTagged.length}) — expected in the shop, tag not scanned
              </p>
              {result.missingTagged.length === 0 ? (
                <p style={{ color: colors.textMuted, fontSize: '0.85rem', margin: '0.5rem 0 0' }}>None — every tagged tool was found.</p>
              ) : (
                <ul style={listStyle}>
                  {result.missingTagged.map((t) => (
                    <li key={t.id} style={toolRowStyle}>
                      {t.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {result.unexpected.length > 0 && (
              <div style={sectionStyle}>
                <p style={{ color: colors.goldBright, fontWeight: 'bold', margin: 0 }}>
                  Unexpected ({result.unexpected.length}) — scanned but not marked Available/Pending
                </p>
                <ul style={listStyle}>
                  {result.unexpected.map((t) => (
                    <li key={t.id} style={toolRowStyle}>
                      {t.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.missingUntagged.length > 0 && (
              <div style={sectionStyle}>
                <p style={{ color: colors.textMuted, fontWeight: 'bold', margin: 0 }}>
                  Not trackable ({result.missingUntagged.length}) — no RFID tag assigned yet
                </p>
                <ul style={listStyle}>
                  {result.missingUntagged.map((t) => (
                    <li key={t.id} style={toolRowStyle}>
                      {t.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default RfidReconciliation;
