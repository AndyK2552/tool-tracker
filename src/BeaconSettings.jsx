import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import PageHeader from './PageHeader';
import { colors, btnStyle } from './theme';

// 0% = -90 dBm (loosest/farthest trigger), 100% = -30 dBm (strictest/closest).
const pctToRssi = (pct) => Math.round(-90 + pct * 0.6);

function BeaconSettings({ onHome }) {
  const [warningPct, setWarningPct] = useState(33);
  const [beepMs, setBeepMs] = useState(5);
  const [thresholdPct, setThresholdPct] = useState(67);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase.from('beacon_settings').select('*').eq('id', true).single();
      if (data) {
        setWarningPct(data.warning_beep_distance_pct);
        setBeepMs(data.beep_duration_ms);
        setThresholdPct(data.threshold_distance_pct);
      }
      setLoading(false);
    };
    fetchSettings();
  }, []);

  // Threshold Distance is authoritative: Warning Beep Distance can never be
  // set to trigger closer-in than Threshold Distance, since chirping has to
  // start before the tone can go continuous.
  const applyThreshold = (pct) => {
    setThresholdPct(pct);
    setWarningPct((w) => Math.min(w, pct));
  };

  const applyWarning = (pct) => {
    setWarningPct(Math.min(pct, thresholdPct));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    const { error } = await supabase
      .from('beacon_settings')
      .update({
        warning_beep_distance_pct: warningPct,
        beep_duration_ms: beepMs,
        threshold_distance_pct: thresholdPct,
        updated_at: new Date().toISOString(),
      })
      .eq('id', true);

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: 'Saved — the board will pick this up on its next poll (within ~5s).' });
    }
    setSaving(false);
  };

  const sliderRowStyle = { marginBottom: '1.75rem' };
  const sliderLabelStyle = { color: colors.white, fontWeight: 'bold', display: 'block', marginBottom: '0.25rem' };
  const sliderValueStyle = { color: colors.gold, fontWeight: 'bold' };
  const sliderHelpStyle = { fontSize: '0.8rem', color: colors.textMuted, margin: '0.35rem 0 0' };

  if (loading) {
    return (
      <div style={{ background: colors.navy, minHeight: '100vh', padding: '1.25rem' }}>
        <p style={{ color: colors.white }}>Loading beacon settings...</p>
      </div>
    );
  }

  return (
    <div style={{ background: colors.navy, minHeight: '100vh' }}>
      <PageHeader title="KYPD Tool Tracker" />

      <div style={{ padding: '1.25rem', maxWidth: '500px', margin: '0 auto' }}>
        <h1 style={{ color: colors.white, fontSize: '20px' }}>Beacon Settings</h1>
        <button onClick={onHome} style={{ ...btnStyle, marginBottom: '1rem' }}>
          Home
        </button>

        <p style={{ color: colors.textMuted, fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          Applies to every tool's beacon at the shop door — no per-tool threshold anymore.
          Changes take effect on the board's next poll (~5s), no reflashing needed.
        </p>

        {message && (
          <p style={{ color: message.type === 'error' ? '#ff8080' : '#5FCF7A', marginBottom: '1rem' }}>
            {message.text}
          </p>
        )}

        <div style={sliderRowStyle}>
          <label style={sliderLabelStyle}>
            Warning Beep Distance: <span style={sliderValueStyle}>{warningPct}%</span>
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={warningPct}
            onChange={(e) => applyWarning(Number(e.target.value))}
            style={{ width: '100%' }}
          />
          <p style={sliderHelpStyle}>
            Chirping starts around {pctToRssi(warningPct)} dBm. Can't be set closer-in than Threshold Distance below.
          </p>
        </div>

        <div style={sliderRowStyle}>
          <label style={sliderLabelStyle}>
            Beep Frequency: <span style={sliderValueStyle}>{beepMs} ms</span>
          </label>
          <input
            type="range"
            min="0"
            max="1000"
            value={beepMs}
            onChange={(e) => setBeepMs(Number(e.target.value))}
            style={{ width: '100%' }}
          />
          <p style={sliderHelpStyle}>
            Length of the shortest chirp, right as it crosses Warning Beep Distance. Grows longer as it gets closer.
          </p>
        </div>

        <div style={sliderRowStyle}>
          <label style={sliderLabelStyle}>
            Threshold Distance: <span style={sliderValueStyle}>{thresholdPct}%</span>
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={thresholdPct}
            onChange={(e) => applyThreshold(Number(e.target.value))}
            style={{ width: '100%' }}
          />
          <p style={sliderHelpStyle}>
            Becomes a continuous tone around {pctToRssi(thresholdPct)} dBm — this is also what's shown as "⚠ Near door" in the app.
          </p>
        </div>

        <button onClick={handleSave} disabled={saving} style={btnStyle}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export default BeaconSettings;
