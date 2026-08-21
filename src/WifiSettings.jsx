import PageHeader from './PageHeader';
import BleWifiProvision from './BleWifiProvision';
import { colors, btnStyle, secondaryBtnStyle } from './theme';

function WifiSettings({ onBack, onHome }) {
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

        <label style={{ color: colors.white, fontWeight: 'bold', display: 'block', marginBottom: '0.25rem' }}>
          Update WiFi via Bluetooth
        </label>
        <BleWifiProvision />
      </div>
    </div>
  );
}

export default WifiSettings;
