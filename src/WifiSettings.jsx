import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import PageHeader from './PageHeader';
import BleWifiProvision from './BleWifiProvision';
import { colors, btnStyle, secondaryBtnStyle } from './theme';

function WifiSettings({ onBack, onHome }) {
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [showWifiPassword, setShowWifiPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase.from('beacon_settings').select('wifi_ssid, wifi_password').eq('id', true).single();
      if (data) {
        setWifiSsid(data.wifi_ssid || '');
        setWifiPassword(data.wifi_password || '');
      }
      setLoading(false);
    };
    fetchSettings();
  }, []);

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

  const sectionStyle = { marginBottom: '1.75rem' };
  const sectionLabelStyle = { color: colors.white, fontWeight: 'bold', display: 'block', marginBottom: '0.25rem' };
  const helpStyle = { fontSize: '0.8rem', color: colors.textMuted, margin: '0.35rem 0 0' };

  if (loading) {
    return (
      <div style={{ background: colors.navy, minHeight: '100vh', padding: '1.25rem' }}>
        <p style={{ color: colors.white }}>Loading WiFi settings...</p>
      </div>
    );
  }

  return (
    <div style={{ background: colors.navy, minHeight: '100vh' }}>
      <PageHeader title="KYPD Tool Tracker" />

      <div style={{ padding: '1.25rem', maxWidth: '500px', margin: '0 auto' }}>
        <h1 style={{ color: colors.white, fontSize: '20px' }}>WiFi Settings</h1>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button onClick={onBack} style={btnStyle}>
            Beacon Settings
          </button>
          <button onClick={onHome} style={secondaryBtnStyle}>
            Home
          </button>
        </div>

        {message && (
          <p style={{ color: message.type === 'error' ? '#ff8080' : '#5FCF7A', marginBottom: '1rem' }}>
            {message.text}
          </p>
        )}

        <div style={sectionStyle}>
          <label style={sectionLabelStyle}>WiFi Network (board)</label>
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
          <p style={helpStyle}>
            Lets you change the board's WiFi (e.g. switching providers) without reflashing. The board only picks this up the next time it needs to reconnect — if it's still connected to the old network, save this while it's online and it'll switch over automatically once that network goes away. If it's already offline with no way back, this alone won't reach it. Leave both fields blank to keep using what's programmed into the firmware.
          </p>
          <button onClick={handleSave} disabled={saving} style={{ ...btnStyle, marginTop: '0.75rem' }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>

        <div style={{ ...sectionStyle, paddingTop: '0.5rem', borderTop: `0.5px solid ${colors.navyBorder}` }}>
          <label style={sectionLabelStyle}>Update WiFi via Bluetooth</label>
          <BleWifiProvision initialSsid={wifiSsid} initialPassword={wifiPassword} />
        </div>
      </div>
    </div>
  );
}

export default WifiSettings;
