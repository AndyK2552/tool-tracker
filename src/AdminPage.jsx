import { useEffect, useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from './supabaseClient';
import CameraCapture from './CameraCapture';
import PageHeader from './PageHeader';
import { colors, btnStyle, secondaryBtnStyle } from './theme';

function AdminPage({ onHome, onSelectTool }) {
  const [name, setName] = useState('');
  const [serial, setSerial] = useState('');
  const [location, setLocation] = useState('Shop');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [showCamera, setShowCamera] = useState(true);
  const [showToolCamera, setShowToolCamera] = useState(false);
  const [toolPhoto, setToolPhoto] = useState(null);
  const [assigningQr, setAssigningQr] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const scannerRef = useRef(null);

  const uploadToolImage = async (base64, serialForPath) => {
    const byteString = atob(base64);
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'image/jpeg' });

    const path = `${encodeURIComponent(serialForPath)}-${Date.now()}.jpg`;
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
          scanner.pause(true);
          setQrCode(decodedText);
          setAssigningQr(false);
        },
        () => {}
      )
      .catch((err) => {
        setMessage({ type: 'error', text: 'Could not start camera: ' + err });
      });

    return () => {
      scanner.stop().then(() => scanner.clear()).catch(() => {});
    };
  }, [assigningQr]);

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

    setSaving(true);

    let imageUrl;
    try {
      imageUrl = await uploadToolImage(toolPhoto, serial.trim());
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
    setShowCamera(true);
    setToolPhoto(null);
    setQrCode('');
    setSaving(false);
  };

  const handleAICapture = async (base64) => {
    setScanning(true);
    setMessage(null);
    setShowCamera(false);
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

  const handleToolPhotoCapture = (base64) => {
    setToolPhoto(base64);
    setShowToolCamera(false);
  };

  const handleStartAssignQr = () => {
    setMessage(null);
    setAssigningQr(true);
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

      <div style={{ padding: '1.25rem' }}>
        <h1 style={{ color: colors.white, fontSize: '20px' }}>Admin: Add Tool</h1>

        <button onClick={onHome} style={{ ...btnStyle, marginBottom: '1rem' }}>
          Home
        </button>

        <div style={{ marginBottom: '1rem', maxWidth: '400px' }}>
          {showCamera ? (
            <CameraCapture onCapture={handleAICapture} capturing={scanning} label="Capture Tool Label" />
          ) : scanning ? (
            <p style={{ color: colors.textMuted }}>Analyzing photo...</p>
          ) : (
            <button type="button" onClick={() => setShowCamera(true)} style={btnStyle}>
              🤖 Scan Tool
            </button>
          )}
        </div>

        {message && (
          <p
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
            {showToolCamera ? (
              <CameraCapture onCapture={handleToolPhotoCapture} capturing={false} label="Capture Tool Photo" />
            ) : toolPhoto ? (
              <div>
                <img
                  src={`data:image/jpeg;base64,${toolPhoto}`}
                  alt="Tool"
                  style={{ width: '100%', maxWidth: '250px', borderRadius: '8px', display: 'block', marginBottom: '0.5rem' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowToolCamera(true);
                    setToolPhoto(null);
                  }}
                  style={secondaryBtnStyle}
                >
                  Retake Photo
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setShowToolCamera(true)} style={secondaryBtnStyle}>
                📷 Take Picture of Tool
              </button>
            )}
          </div>

          <label style={fieldLabelStyle}>QR Code</label>
          <div style={{ marginBottom: '1rem' }}>
            {assigningQr ? (
              <div>
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
                📷 Assign QR Code
              </button>
            )}
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
