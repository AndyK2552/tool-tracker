import { useEffect, useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from './supabaseClient';
import { useCameraCapture } from './useCameraCapture';
import { safeStopScanner, safePauseScanner, applyDefaultZoom } from './qrScannerUtils';
import { formatMacInput, MAC_PATTERN } from './macFormat';
import PageHeader from './PageHeader';
import { colors, btnStyle, secondaryBtnStyle } from './theme';

function AdminPage({ onHome, onSelectTool }) {
  const [name, setName] = useState('');
  const [serial, setSerial] = useState('');
  const [location, setLocation] = useState('Shop');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [toolPhoto, setToolPhoto] = useState(null);
  const [assigningQr, setAssigningQr] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [beaconMac, setBeaconMac] = useState('');
  const [beaconThreshold, setBeaconThreshold] = useState('-75');
  const [scanningBeaconMac, setScanningBeaconMac] = useState(false);
  const scannerRef = useRef(null);
  const qrPanelRef = useRef(null);
  const beaconQrPanelRef = useRef(null);
  const messageRef = useRef(null);

  useEffect(() => {
    if (message) messageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [message]);

  const handleAICapture = async (base64) => {
    setScanning(true);
    setMessage(null);
    try {
      const response = await fetch('/api/analyze-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mediaType: 'image/jpeg' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to analyze image');
      setName(result.name || '');
      setSerial(result.serial || '');
      setMessage({ type: 'info', text: 'Detected — please review and correct below before saving.' });
    } catch (err) {
      setMessage({ type: 'error', text: 'AI scan failed: ' + err.message });
    }
    setScanning(false);
  };

  const { open: openNameplateCamera, error: nameplateCameraError, input: nameplateCameraInput } = useCameraCapture(handleAICapture);
  const { open: openToolPhotoCamera, error: toolPhotoCameraError, input: toolPhotoCameraInput } = useCameraCapture(setToolPhoto);

  const uploadToolImage = async (base64, qrCodeForPath) => {
    const byteString = atob(base64);
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'image/jpeg' });

    const safeQrCode = qrCodeForPath.replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `${safeQrCode}-${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage.from('tool_images').upload(path, blob, {
      contentType: 'image/jpeg',
    });
    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('tool_images').getPublicUrl(path);
    return data.publicUrl;
  };

  useEffect(() => {
    if (!assigningQr) return;

    const scanner = new Html5Qrcode('qr-add-reader');
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10 },
        (decodedText) => {
          safePauseScanner(scanner, true);
          setQrCode(decodedText);
          setAssigningQr(false);
        },
        () => {}
      )
      .then(() => applyDefaultZoom(scanner))
      .catch((err) => {
        setMessage({ type: 'error', text: 'Could not start camera: ' + err });
      });

    return () => {
      safeStopScanner(scanner);
    };
  }, [assigningQr]);

  useEffect(() => {
    if (!assigningQr || !qrPanelRef.current) return;
    const el = qrPanelRef.current;
    const observer = new ResizeObserver(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [assigningQr]);

  useEffect(() => {
    if (!scanningBeaconMac) return;

    const scanner = new Html5Qrcode('beacon-qr-add-reader');
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10 },
        (decodedText) => {
          setBeaconMac(formatMacInput(decodedText));
          setScanningBeaconMac(false);
        },
        () => {}
      )
      .then(() => applyDefaultZoom(scanner))
      .catch((err) => {
        setMessage({ type: 'error', text: 'Could not start camera: ' + err });
        setScanningBeaconMac(false);
      });

    return () => {
      safeStopScanner(scanner);
    };
  }, [scanningBeaconMac]);

  useEffect(() => {
    if (!scanningBeaconMac || !beaconQrPanelRef.current) return;
    const el = beaconQrPanelRef.current;
    const observer = new ResizeObserver(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [scanningBeaconMac]);

  const handleAddTool = async (e) => {
    e.preventDefault();
    setMessage(null);

    if (!toolPhoto) {
      setMessage({ type: 'error', text: 'Please take a picture of the tool before saving.' });
      return;
    }
    if (!qrCode) {
      setMessage({ type: 'error', text: 'Please assign a QR code before saving.' });
      return;
    }

    const trimmedBeaconMac = beaconMac.trim();
    if (trimmedBeaconMac && !MAC_PATTERN.test(trimmedBeaconMac)) {
      setMessage({ type: 'error', text: 'Beacon MAC must look like AA:BB:CC:DD:EE:FF.' });
      return;
    }

    const parsedThreshold = parseInt(beaconThreshold, 10);
    if (trimmedBeaconMac && (isNaN(parsedThreshold) || parsedThreshold > 0)) {
      setMessage({ type: 'error', text: 'RSSI threshold must be a negative number (e.g. -75).' });
      return;
    }

    setSaving(true);

    let imageUrl;
    try {
      imageUrl = await uploadToolImage(toolPhoto, qrCode);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to upload photo: ' + err.message });
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from('tools')
      .insert({
        id: serial.trim(),
        name: name.trim(),
        location,
        image_url: imageUrl,
        qr_code: qrCode,
        is_checked_out: false,
        condition: 'Ready',
        beacon_mac: trimmedBeaconMac ? trimmedBeaconMac.toUpperCase() : null,
        beacon_rssi_threshold: trimmedBeaconMac ? parsedThreshold : -75,
      });

    if (error) {
      if (error.code === '23505') {
        if (error.message.includes('qr_code')) {
          const { data: conflictingTool } = await supabase
            .from('tools')
            .select('id, name')
            .eq('qr_code', qrCode)
            .single();

          if (conflictingTool) {
            setMessage({
              type: 'error',
              text: 'That QR code is already assigned to ',
              link: { toolId: conflictingTool.id, label: conflictingTool.name },
            });
          } else {
            setMessage({ type: 'error', text: 'That QR code is already assigned to another tool.' });
          }
        } else if (error.message.includes('beacon_mac')) {
          setMessage({ type: 'error', text: 'That beacon MAC is already assigned to another tool.' });
        } else {
          setMessage({ type: 'error', text: `A tool with serial number "${serial.trim()}" already exists.` });
        }
      } else {
        setMessage({ type: 'error', text: error.message });
      }
      setSaving(false);
      return;
    }

    setMessage({ type: 'success', text: `Added "${name}" successfully.` });
    setName('');
    setSerial('');
    setLocation('Shop');
    setToolPhoto(null);
    setQrCode('');
    setBeaconMac('');
    setBeaconThreshold('-75');
    setSaving(false);
  };

  const handleStartAssignQr = () => {
    setMessage(null);
    setScanningBeaconMac(false);
    setAssigningQr(true);
  };

  const handleStartScanBeaconMac = () => {
    setMessage(null);
    setAssigningQr(false);
    setScanningBeaconMac(true);
  };

  const inputStyle = {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    padding: '0.6rem',
    marginBottom: '1rem',
    borderRadius: '6px',
    border: 'none',
  };

  const fieldLabelStyle = { color: colors.white, fontSize: '14px', display: 'block', marginBottom: '0.35rem' };


  return (
    <div style={{ background: colors.navy, minHeight: '100vh' }}>
      <PageHeader title="KYPD Tool Tracker" />

      <div style={{ padding: '1.25rem', maxWidth: '500px', margin: '0 auto' }}>
        <h1 style={{ color: colors.white, fontSize: '20px' }}>Admin: Add Tool</h1>

        <button onClick={onHome} style={{ ...btnStyle, marginBottom: '1rem' }}>
          Home
        </button>

        <div style={{ marginBottom: '1rem', maxWidth: '400px' }}>
          {scanning ? (
            <p style={{ color: colors.textMuted }}>Analyzing photo...</p>
          ) : (
            <button type="button" onClick={openNameplateCamera} style={btnStyle}>
              Scan Tool
            </button>
          )}
          {nameplateCameraError && <p style={{ color: '#ff8080', fontSize: '0.85rem' }}>{nameplateCameraError}</p>}
        </div>
        {nameplateCameraInput}

        {message && (
          <p
            ref={messageRef}
            style={{
              color: message.type === 'error' ? '#ff8080' : message.type === 'info' ? colors.textMuted : '#5FCF7A',
              marginBottom: '1rem',
            }}
          >
            {message.text}
            {message.link && (
              <button
                type="button"
                onClick={() => onSelectTool(message.link.toolId)}
                style={{
                  background: 'none', border: 'none', padding: 0, margin: 0, cursor: 'pointer',
                  color: 'inherit', textDecoration: 'underline', fontWeight: 'bold', font: 'inherit',
                }}
              >
                {message.link.label}
              </button>
            )}
          </p>
        )}

        <form onSubmit={handleAddTool} style={{ maxWidth: '400px' }}>
          <label style={fieldLabelStyle}>Tool Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={inputStyle}
          />

          <label style={fieldLabelStyle}>Serial Number</label>
          <input
            type="text"
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            required
            style={inputStyle}
          />

          <label style={fieldLabelStyle}>Location</label>
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            required
            style={inputStyle}
          >
            <option value="">Select a location...</option>
            <option value="Shop">Shop</option>
            <option value="Truck">Truck</option>
          </select>

          <label style={fieldLabelStyle}>Tool Photo</label>
          <div style={{ marginBottom: '1rem' }}>
            {toolPhoto ? (
              <div>
                <img
                  src={`data:image/jpeg;base64,${toolPhoto}`}
                  alt="Tool"
                  style={{ width: '100%', maxWidth: '250px', borderRadius: '8px', display: 'block', margin: '0 auto 0.5rem' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setToolPhoto(null);
                    openToolPhotoCamera();
                  }}
                  style={secondaryBtnStyle}
                >
                  Retake Photo
                </button>
              </div>
            ) : (
              <button type="button" onClick={openToolPhotoCamera} style={secondaryBtnStyle}>
                Take Picture of Tool
              </button>
            )}
            {toolPhotoCameraError && <p style={{ color: '#ff8080', fontSize: '0.85rem' }}>{toolPhotoCameraError}</p>}
          </div>
          {toolPhotoCameraInput}

          <label style={fieldLabelStyle}>QR Code</label>
          <div style={{ marginBottom: '1rem' }}>
            {assigningQr ? (
              <div ref={qrPanelRef}>
                <div id="qr-add-reader" style={{ width: '100%' }}></div>
                <p style={{ fontSize: '0.85rem', color: colors.textMuted, marginTop: '0.5rem' }}>
                  Point the camera at the QR code — it'll scan automatically.
                </p>
                <button type="button" onClick={() => setAssigningQr(false)} style={{ ...secondaryBtnStyle, marginTop: '0.5rem' }}>
                  Cancel
                </button>
              </div>
            ) : qrCode ? (
              <div>
                <p style={{ color: colors.textMuted, marginBottom: '0.5rem' }}>{qrCode}</p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button type="button" onClick={handleStartAssignQr} style={secondaryBtnStyle}>Rescan</button>
                  <button type="button" onClick={() => setQrCode('')} style={secondaryBtnStyle}>Clear</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={handleStartAssignQr} style={secondaryBtnStyle}>
                Assign QR Code
              </button>
            )}
          </div>

          <label style={fieldLabelStyle}>Beacon (optional)</label>
          <div style={{ marginBottom: '1rem' }}>
            <input
              type="text"
              value={beaconMac}
              onChange={(e) => setBeaconMac(formatMacInput(e.target.value))}
              placeholder="AA:BB:CC:DD:EE:FF"
              style={{ ...inputStyle, marginBottom: '0.5rem' }}
            />
            {scanningBeaconMac ? (
              <div ref={beaconQrPanelRef}>
                <div id="beacon-qr-add-reader" style={{ width: '100%' }}></div>
                <p style={{ fontSize: '0.85rem', color: colors.textMuted, marginTop: '0.5rem' }}>
                  Point the camera at the beacon's QR code — it'll scan automatically.
                </p>
                <button type="button" onClick={() => setScanningBeaconMac(false)} style={{ ...secondaryBtnStyle, marginTop: '0.5rem' }}>
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" onClick={handleStartScanBeaconMac} style={{ ...secondaryBtnStyle, marginBottom: '0.75rem' }}>
                Scan Beacon QR Code
              </button>
            )}
            <label style={fieldLabelStyle}>Alarm RSSI Threshold (dBm)</label>
            <input
              type="number"
              value={beaconThreshold}
              onChange={(e) => setBeaconThreshold(e.target.value)}
              placeholder="-75"
              style={{ ...inputStyle, marginBottom: '0.35rem' }}
            />
            <p style={{ fontSize: '0.8rem', color: colors.textMuted, margin: 0 }}>
              Only used if a beacon MAC is set above. The buzzer sounds at the shop door when this tool is Available and its beacon's signal rises above this threshold.
            </p>
          </div>

          <button type="submit" disabled={saving} style={btnStyle}>
            {saving ? 'Adding...' : 'Add Tool'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AdminPage;
