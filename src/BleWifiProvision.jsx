import { useEffect, useRef, useState } from 'react';
import { colors, btnStyle, secondaryBtnStyle } from './theme';

// Must match the firmware's BLE_PROVISION_SERVICE_UUID / _CRED_CHAR_UUID /
// _STATUS_CHAR_UUID in shop-beacon-monitor.ino.
const SERVICE_UUID = '6f5c0001-8bde-4ea9-9c1a-3f6b1a2e9001';
const CRED_CHAR_UUID = '6f5c0002-8bde-4ea9-9c1a-3f6b1a2e9001';
const STATUS_CHAR_UUID = '6f5c0003-8bde-4ea9-9c1a-3f6b1a2e9001';

// Must match BLE_PROVISIONING_PIN in the board's config.h.
const PROVISIONING_PIN = '482913';

function BleWifiProvision() {
  const [supported] = useState(() => !!navigator.bluetooth);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState(null);
  const [sending, setSending] = useState(false);

  const credCharRef = useRef(null);
  const deviceRef = useRef(null);

  useEffect(() => () => {
    if (deviceRef.current?.gatt?.connected) {
      deviceRef.current.gatt.disconnect();
    }
  }, []);

  const handleNotify = (event) => {
    const value = new TextDecoder().decode(event.target.value);
    setStatus(value);
  };

  const handleDisconnected = () => {
    setConnected(false);
    credCharRef.current = null;
    setStatus((s) => s || 'Bluetooth connection lost.');
  };

  const handleConnect = async () => {
    setConnecting(true);
    setStatus(null);
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }],
        optionalServices: [SERVICE_UUID],
      });
      deviceRef.current = device;
      device.addEventListener('gattserverdisconnected', handleDisconnected);

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(SERVICE_UUID);
      const credChar = await service.getCharacteristic(CRED_CHAR_UUID);
      const statusChar = await service.getCharacteristic(STATUS_CHAR_UUID);

      credCharRef.current = credChar;
      await statusChar.startNotifications();
      statusChar.addEventListener('characteristicvaluechanged', handleNotify);

      const initial = await statusChar.readValue();
      setStatus(new TextDecoder().decode(initial));
      setConnected(true);
    } catch (err) {
      setStatus(err?.name === 'NotFoundError' ? null : `Connection failed: ${err.message}`);
    }
    setConnecting(false);
  };

  const handleSend = async () => {
    if (!credCharRef.current) return;
    const trimmedSsid = ssid.trim();
    if (!trimmedSsid) {
      setStatus('Enter a network name.');
      return;
    }
    setSending(true);
    setStatus('Sending...');
    try {
      const payload = JSON.stringify({ pin: PROVISIONING_PIN, ssid: trimmedSsid, password });
      await credCharRef.current.writeValue(new TextEncoder().encode(payload));
    } catch (err) {
      setStatus(`Send failed: ${err.message}`);
    }
    setSending(false);
  };

  const handleDisconnect = () => {
    if (deviceRef.current?.gatt?.connected) {
      deviceRef.current.gatt.disconnect();
    }
    setConnected(false);
    credCharRef.current = null;
  };

  const sliderHelpStyle = { fontSize: '0.8rem', color: colors.textMuted, margin: '0.35rem 0 0' };

  if (!supported) {
    return (
      <div>
        <p style={sliderHelpStyle}>
          Update WiFi via Bluetooth isn't available in this browser — it needs Web Bluetooth, which
          only works in Chrome/Edge on desktop or Android (not Safari or iOS).
        </p>
      </div>
    );
  }

  return (
    <div>
      <p style={sliderHelpStyle}>
        Connects directly to the board over Bluetooth to change its WiFi network — no internet or
        WiFi connection needed on either side, so this works even if the board is already offline
        (e.g. its old network is gone). The board must be powered on and within range. Chrome/Edge only.
      </p>

      {!connected ? (
        <button onClick={handleConnect} disabled={connecting} style={{ ...secondaryBtnStyle, marginTop: '0.5rem' }}>
          {connecting ? 'Connecting...' : 'Connect via Bluetooth'}
        </button>
      ) : (
        <div style={{ marginTop: '0.5rem' }}>
          <input
            type="text"
            value={ssid}
            onChange={(e) => setSsid(e.target.value)}
            placeholder="Network name (SSID)"
            style={{
              width: '100%', padding: '0.6rem', borderRadius: '6px', border: 'none', marginBottom: '0.5rem', boxSizing: 'border-box',
            }}
          />
          <div style={{ position: 'relative', marginBottom: '0.5rem' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              style={{
                width: '100%', padding: '0.6rem', paddingRight: '3.5rem', borderRadius: '6px', border: 'none', boxSizing: 'border-box',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              style={{
                position: 'absolute', right: '0.4rem', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', color: colors.navy, fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer', padding: '0.25rem',
              }}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleSend} disabled={sending} style={btnStyle}>
              {sending ? 'Sending...' : 'Send to board'}
            </button>
            <button onClick={handleDisconnect} style={secondaryBtnStyle}>
              Disconnect
            </button>
          </div>
        </div>
      )}

      {status && (
        <p style={{ ...sliderHelpStyle, color: colors.textMuted, marginTop: '0.75rem' }}>
          Board says: {status}
        </p>
      )}
    </div>
  );
}

export default BleWifiProvision;
