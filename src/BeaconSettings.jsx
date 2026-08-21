import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import PageHeader from './PageHeader';
import BeaconRangeVisual from './BeaconRangeVisual';
import BleWifiProvision from './BleWifiProvision';
import { colors, btnStyle } from './theme';

// 0% = -90 dBm (loosest/farthest trigger), 100% = -30 dBm (strictest/closest).
const pctToRssi = (pct) => Math.round(-90 + pct * 0.6);

function BeaconSettings({ onHome }) {
  const [warningPct, setWarningPct] = useState(33);
  const [beepMs, setBeepMs] = useState(5);
  const [thresholdPct, setThresholdPct] = useState(67);
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [showWifiPassword, setShowWifiPassword] = useState(false);
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
        setWifiSsid(data.wifi_ssid || '');
        setWifiPassword(data.wifi_password || '');
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
    const trimmedSsid = wifiSsid.trim();
    const trimmedPassword = wifiPassword.trim();
    if (!!trimmedSsid !== !!trimmedPassword) {
      setMessage({ type: 'error', text: 'Enter both WiFi Network Name and Password, or leave both blank.' });
      return;
    }

    setSaving(true);
    setMessage(null);

    const { error } = await supabase
      .from('beacon_settings')
      .update({
        warning_beep_distance_pct: warningPct,
        beep_duration_ms: beepMs,
        threshold_distance_pct: thresholdPct,
        wifi_ssid: trimmedSsid || null,
        wifi_password: trimmedPassword || null,
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
          <label style={sliderLabelStyle}>Warning &amp; Threshold Distance</label>
          <BeaconRangeVisual
            warningPct={warningPct}
            thresholdPct={thresholdPct}
            warningRssi={pctToRssi(warningPct)}
            thresholdRssi={pctToRssi(thresholdPct)}
            onWarningChange={applyWarning}
            onThresholdChange={applyThreshold}
          />
          <p style={sliderHelpStyle}>
            Drag the red ring (Threshold — becomes a continuous tone, shown as "⚠ Near door" in the app) or the yellow ring (Warning — chirping starts). Threshold can't be dragged outside Warning, or vice versa.
          </p>
        </div>

        <div style={sliderRowStyle}>
          <label style={sliderLabelStyle}>
            Beep Frequency: <span style={sliderValueStyle}>{beepMs} ms</span>
          </label>
          <input
            type="range"
            min="0"
            max="2000"
            value={beepMs}
            onChange={(e) => setBeepMs(Number(e.target.value))}
            style={{ width: '100%' }}
          />
          <p style={sliderHelpStyle}>
            Gap between chirps right as it crosses Warning Beep Distance (each chirp itself is a fixed length). The gap shrinks as it gets closer, until the chirps run together into a continuous tone.
          </p>
        </div>

        <div style={{ ...sliderRowStyle, paddingTop: '0.5rem', borderTop: `0.5px solid ${colors.navyBorder}` }}>
          <label style={sliderLabelStyle}>WiFi Network (board)</label>
          <input
            type="text"
            value={wifiSsid}
            onChange={(e) => setWifiSsid(e.target.value)}
            placeholder="Network name (SSID)"
            style={{
              width: '100%', padding: '0.6rem', borderRadius: '6px', border: 'none', marginBottom: '0.5rem', boxSizing: 'border-box',
            }}
          />
          <div style={{ position: 'relative' }}>
            <input
              type={showWifiPassword ? 'text' : 'password'}
              value={wifiPassword}
              onChange={(e) => setWifiPassword(e.target.value)}
              placeholder="Password"
              style={{
                width: '100%', padding: '0.6rem', paddingRight: '3.5rem', borderRadius: '6px', border: 'none', boxSizing: 'border-box',
              }}
            />
            <button
              type="button"
              onClick={() => setShowWifiPassword((v) => !v)}
              style={{
                position: 'absolute', right: '0.4rem', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', color: colors.navy, fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer', padding: '0.25rem',
              }}
            >
              {showWifiPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <p style={sliderHelpStyle}>
            Lets you change the board's WiFi (e.g. switching providers) without reflashing. The board only picks this up the next time it needs to reconnect — if it's still connected to the old network, save this while it's online and it'll switch over automatically once that network goes away. If it's already offline with no way back, this alone won't reach it. Leave both fields blank to keep using what's programmed into the firmware.
          </p>
        </div>

        <div style={{ ...sliderRowStyle, paddingTop: '0.5rem', borderTop: `0.5px solid ${colors.navyBorder}` }}>
          <label style={sliderLabelStyle}>Update WiFi via Bluetooth</label>
          <BleWifiProvision />
        </div>

        <button onClick={handleSave} disabled={saving} style={btnStyle}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export default BeaconSettings;
