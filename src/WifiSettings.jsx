import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import PageHeader from './PageHeader';
import BleWifiProvision from './BleWifiProvision';
import { colors, btnStyle, secondaryBtnStyle } from './theme';

function WifiSettings({ onBack, onHome }) {
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase.from('beacon_settings').select('offline_alerts_enabled').eq('id', true).single();
      if (data) setAlertsEnabled(data.offline_alerts_enabled);
      setLoading(false);
    };
    fetchSettings();
  }, []);

  const handleToggleAlerts = async (e) => {
    const enabled = e.target.checked;
    setAlertsEnabled(enabled);
    setMessage(null);

    const { error } = await supabase
      .from('beacon_settings')
      .update({ offline_alerts_enabled: enabled })
      .eq('id', true);

    if (error) {
      setAlertsEnabled(!enabled);
      setMessage({ type: 'error', text: error.message });
    }
  };

  const sectionStyle = { marginBottom: '1.75rem' };
  const sectionLabelStyle = { color: colors.white, fontWeight: 'bold', display: 'block', marginBottom: '0.25rem' };

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
          <p style={{ color: '#ff8080', marginBottom: '1rem', fontSize: '0.85rem' }}>{message.text}</p>
        )}

        <div style={sectionStyle}>
          <label
            style={{
              display: 'flex', alignItems: 'center', gap: '0.65rem',
              cursor: loading ? 'default' : 'pointer',
            }}
          >
            <span style={{ position: 'relative', display: 'inline-block', width: '46px', height: '26px', flexShrink: 0 }}>
              <input
                type="checkbox"
                checked={alertsEnabled}
                disabled={loading}
                onChange={handleToggleAlerts}
                style={{
                  position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0,
                  opacity: 0, cursor: loading ? 'default' : 'pointer',
                }}
              />
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute', inset: 0,
                  background: alertsEnabled ? colors.gold : colors.navyLight,
                  border: `0.5px solid ${colors.navyBorder}`,
                  borderRadius: '999px',
                  transition: 'background-color 0.15s ease',
                }}
              >
                <span
                  style={{
                    position: 'absolute', top: '2px', left: alertsEnabled ? '22px' : '2px',
                    width: '20px', height: '20px', borderRadius: '50%',
                    background: colors.white,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.35)',
                    transition: 'left 0.15s ease',
                  }}
                />
              </span>
            </span>
            <span style={sectionLabelStyle}>Email admins if the Beacon Tower goes offline</span>
          </label>
        </div>

        <div style={{ ...sectionStyle, paddingTop: '0.5rem', borderTop: `0.5px solid ${colors.navyBorder}` }}>
          <label style={sectionLabelStyle}>Update WiFi via Bluetooth</label>
          <BleWifiProvision />
        </div>
      </div>
    </div>
  );
}

export default WifiSettings;
