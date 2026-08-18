import { useEffect, useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from './supabaseClient';
import CameraCapture from './CameraCapture';
import PageHeader from './PageHeader';
import { colors, btnStyle, secondaryBtnStyle } from './theme';

function ToolDetail({ toolId, isAdmin, techProfile, onHome, onBackToStatus, onSelectTool }) {
  const [tool, setTool] = useState(null);
  const [techs, setTechs] = useState([]);
  const [selectedTech, setSelectedTech] = useState(techProfile?.name || '');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [assigningQr, setAssigningQr] = useState(false);
  const [scannedQr, setScannedQr] = useState('');
  const [assigningLocation, setAssigningLocation] = useState(false);
  const [newLocation, setNewLocation] = useState('');
  const [updatingPhoto, setUpdatingPhoto] = useState(false);
  const [newPhoto, setNewPhoto] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const scannerRef = useRef(null);
  const qrPanelRef = useRef(null);
  const locationPanelRef = useRef(null);
  const photoPanelRef = useRef(null);

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
    if (assigningLocation) locationPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [assigningLocation]);

  useEffect(() => {
    if (!updatingPhoto || !photoPanelRef.current) return;
    const el = photoPanelRef.current;
    const observer = new ResizeObserver(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [updatingPhoto]);

  const fetchTool = async () => {
    const { data } = await supabase.from('tools').select('*').eq('id', toolId).single();
    setTool(data);
    setLoading(false);
  };

  const fetchTechs = async () => {
    if (!isAdmin) return;
    const { data } = await supabase.from('profiles').select('name').order('name');
    setTechs(data || []);
  };

  useEffect(() => {
    fetchTool();
    fetchTechs();
  }, [toolId]);

  useEffect(() => {
    if (!assigningQr) return;

    const scanner = new Html5Qrcode('qr-assign-reader');
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10 },
        (decodedText) => {
          scanner.pause(true);
          setScannedQr(decodedText);
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

  const handleStartAssignQr = () => {
    setScannedQr('');
    setMessage(null);
    setAssigningLocation(false);
    setUpdatingPhoto(false);
    setAssigningQr(true);
  };

  const handleCancelAssignQr = () => {
    setAssigningQr(false);
    setScannedQr('');
  };

  const handleRescanQr = () => {
    setScannedQr('');
    if (scannerRef.current) {
      try {
        scannerRef.current.resume();
      } catch {
        // scanner wasn't running (e.g. camera never started) — nothing to resume
      }
    }
  };

  const handleSubmitQr = async () => {
    if (!scannedQr) return;

    const { data, error } = await supabase
      .from('tools')
      .update({ qr_code: scannedQr })
      .eq('id', tool.id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        const { data: conflictingTool } = await supabase
          .from('tools')
          .select('id, name')
          .eq('qr_code', scannedQr)
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
        setMessage({ type: 'error', text: error.message });
      }
      return;
    }

    setTool(data);
    setAssigningQr(false);
    setScannedQr('');
    setMessage({ type: 'success', text: 'QR code assigned.' });
  };

  const handleStartAssignLocation = () => {
    setNewLocation(tool.location || '');
    setMessage(null);
    setAssigningQr(false);
    setUpdatingPhoto(false);
    setAssigningLocation(true);
  };

  const handleCancelAssignLocation = () => {
    setAssigningLocation(false);
    setNewLocation('');
  };

  const handleSubmitLocation = async () => {
    if (!newLocation) return;

    const { data, error } = await supabase
      .from('tools')
      .update({ location: newLocation })
      .eq('id', tool.id)
      .select()
      .single();

    if (error) {
      setMessage({ type: 'error', text: error.message });
      return;
    }

    setTool(data);
    setAssigningLocation(false);
    setNewLocation('');
    setMessage({ type: 'success', text: 'Location updated.' });
  };

  const uploadToolImage = async (base64, pathSeed) => {
    const byteString = atob(base64);
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'image/jpeg' });

    const safeSeed = pathSeed.replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `${safeSeed}-${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage.from('tool_images').upload(path, blob, {
      contentType: 'image/jpeg',
    });
    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('tool_images').getPublicUrl(path);
    return data.publicUrl;
  };

  const handleStartUpdatePhoto = () => {
    setNewPhoto(null);
    setMessage(null);
    setAssigningQr(false);
    setAssigningLocation(false);
    setUpdatingPhoto(true);
  };

  const handleCancelUpdatePhoto = () => {
    setUpdatingPhoto(false);
    setNewPhoto(null);
  };

  const handleSubmitPhoto = async () => {
    if (!newPhoto) return;
    setUploadingPhoto(true);

    try {
      const imageUrl = await uploadToolImage(newPhoto, tool.qr_code || tool.id);
      const { data, error } = await supabase
        .from('tools')
        .update({ image_url: imageUrl })
        .eq('id', tool.id)
        .select()
        .single();

      if (error) {
        setMessage({ type: 'error', text: error.message });
        setUploadingPhoto(false);
        return;
      }

      setTool(data);
      setUpdatingPhoto(false);
      setNewPhoto(null);
      setMessage({ type: 'success', text: 'Photo updated.' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to upload photo: ' + err.message });
    }
    setUploadingPhoto(false);
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete "${tool.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from('tools').delete().eq('id', tool.id);
    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      onBackToStatus();
    }
  };

  const handleReturn = async () => {
    const now = new Date().toISOString();
    const techWhoReturned = tool.checked_out_by;

    const { data, error } = await supabase
      .from('tools')
      .update({ is_checked_out: false, checked_out_by: null, checked_out_at: null })
      .eq('id', tool.id)
      .select()
      .single();

    if (error) {
      setMessage({ type: 'error', text: error.message });
      return;
    }

    await supabase.from('tool_history').insert({
      tool_id: tool.id, tool_name: tool.name, action: 'returned', tech_name: techWhoReturned, timestamp: now,
    });

    setTool(data);
    setMessage({ type: 'success', text: 'Tool returned.' });
  };

  const handleCheckOut = async (techName) => {
    if (!techName) {
      setMessage({ type: 'error', text: 'Please select a tech first.' });
      return;
    }

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('tools')
      .update({ is_checked_out: true, checked_out_by: techName, checked_out_at: now, overdue_alert_sent: false })
      .eq('id', tool.id)
      .select()
      .single();

    if (error) {
      setMessage({ type: 'error', text: error.message });
      return;
    }

    await supabase.from('tool_history').insert({
      tool_name: tool.name, tool_id: tool.id, action: 'checked_out', tech_name: techName, timestamp: now,
    });

    setTool(data);
    setMessage({ type: 'success', text: `Checked out to ${techName}.` });
  };


  if (loading) return <p style={{ color: colors.white, padding: '1rem' }}>Loading...</p>;
  if (!tool) return <p style={{ color: colors.white, padding: '1rem' }}>Tool not found.</p>;

  const canReturn = isAdmin || tool.checked_out_by === techProfile?.name;

  return (
    <div style={{ background: colors.navy, minHeight: '100vh' }}>
      <PageHeader title="KYPD Tool Tracker" />

      <div style={{ padding: '1.25rem' }}>
        <button onClick={isAdmin ? onHome : onBackToStatus} style={{ ...btnStyle, marginBottom: '1rem' }}>
          {isAdmin ? 'Home' : 'Back to Tool Status'}
        </button>

        <h1 style={{ color: colors.white, fontSize: '20px' }}>{tool.name}</h1>

        {tool.image_url && (
          <img
            src={tool.image_url}
            alt={tool.name}
            style={{ width: '100%', maxWidth: '400px', borderRadius: '8px', display: 'block', marginBottom: '1rem' }}
          />
        )}

        <div style={{ background: colors.navyLight, border: `0.5px solid ${colors.navyBorder}`, borderRadius: '8px', padding: '1rem', maxWidth: '400px' }}>
          <p style={{ color: colors.textMuted }}><strong style={{ color: colors.white }}>Serial Number:</strong> {tool.id}</p>
          <p style={{ color: colors.textMuted }}><strong style={{ color: colors.white }}>QR Code:</strong> {tool.qr_code || '—'}</p>
          <p style={{ color: colors.textMuted }}><strong style={{ color: colors.white }}>Location:</strong> {tool.location || '—'}</p>
          <p style={{ color: colors.textMuted }}><strong style={{ color: colors.white }}>Checked out:</strong> {tool.is_checked_out ? 'Yes' : 'No'}</p>
          <p style={{ color: colors.textMuted }}><strong style={{ color: colors.white }}>Checked out by:</strong> {tool.checked_out_by || '—'}</p>
          <p style={{ color: colors.textMuted }}><strong style={{ color: colors.white }}>Condition:</strong> {tool.condition}</p>

          {tool.is_checked_out ? (
            canReturn ? (
              <button onClick={handleReturn} style={btnStyle}>Return</button>
            ) : (
              <button disabled title={`Only ${tool.checked_out_by} or an admin can return this tool`} style={{ ...btnStyle, opacity: 0.5 }}>
                Return
              </button>
            )
          ) : isAdmin ? (
            <div style={{ marginTop: '0.5rem' }}>
              <select
                value={selectedTech}
                onChange={(e) => setSelectedTech(e.target.value)}
                style={{ padding: '0.5rem', marginRight: '0.5rem', borderRadius: '6px', border: 'none' }}
              >
                <option value="">Select a tech...</option>
                {techs.map((t) => (
                  <option key={t.name} value={t.name}>{t.name}</option>
                ))}
              </select>
              <button onClick={() => handleCheckOut(selectedTech)} style={{ ...btnStyle, marginTop: 0 }}>Check Out</button>
            </div>
          ) : (
            <button onClick={() => handleCheckOut(techProfile.name)} style={btnStyle}>Check Out</button>
          )}

          {isAdmin && (
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button onClick={handleStartAssignQr} style={{ ...(assigningQr ? btnStyle : secondaryBtnStyle), marginTop: 0 }}>
                Assign QR Code
              </button>
              <button onClick={handleStartAssignLocation} style={{ ...(assigningLocation ? btnStyle : secondaryBtnStyle), marginTop: 0 }}>
                Assign Location
              </button>
              <button onClick={handleStartUpdatePhoto} style={{ ...(updatingPhoto ? btnStyle : secondaryBtnStyle), marginTop: 0 }}>
                Update Photo
              </button>
              <button onClick={handleDelete} style={{ ...secondaryBtnStyle, color: '#ff8080', marginTop: 0 }}>
                Delete Tool
              </button>
            </div>
          )}

          {isAdmin && updatingPhoto && (
            <div ref={photoPanelRef} style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: `0.5px solid ${colors.navyBorder}` }}>
              {!newPhoto ? (
                <>
                  <CameraCapture onCapture={setNewPhoto} capturing={false} label="Capture Tool Photo" />
                  <button onClick={handleCancelUpdatePhoto} style={{ ...secondaryBtnStyle, marginTop: '0.75rem' }}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <img
                    src={`data:image/jpeg;base64,${newPhoto}`}
                    alt="New tool"
                    style={{ width: '100%', maxWidth: '250px', borderRadius: '8px', display: 'block', marginBottom: '0.75rem' }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button onClick={handleSubmitPhoto} disabled={uploadingPhoto} style={btnStyle}>
                      {uploadingPhoto ? 'Uploading...' : 'Submit'}
                    </button>
                    <button onClick={() => setNewPhoto(null)} style={secondaryBtnStyle}>Retake</button>
                    <button onClick={handleCancelUpdatePhoto} style={secondaryBtnStyle}>Cancel</button>
                  </div>
                </>
              )}
            </div>
          )}

          {isAdmin && assigningLocation && (
            <div ref={locationPanelRef} style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: `0.5px solid ${colors.navyBorder}` }}>
              <label style={{ display: 'block', color: colors.white, fontWeight: 'bold', marginBottom: '0.35rem' }}>
                Location
              </label>
              <select
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: 'none', marginBottom: '0.75rem', boxSizing: 'border-box' }}
              >
                <option value="">Select a location...</option>
                <option value="Shop">Shop</option>
                <option value="Truck">Truck</option>
              </select>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button onClick={handleSubmitLocation} style={btnStyle}>Submit</button>
                <button onClick={handleCancelAssignLocation} style={secondaryBtnStyle}>Cancel</button>
              </div>
            </div>
          )}

          {isAdmin && assigningQr && (
            <div ref={qrPanelRef} style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: `0.5px solid ${colors.navyBorder}` }}>
              {!scannedQr ? (
                <>
                  <div id="qr-assign-reader" style={{ width: '100%' }}></div>
                  <p style={{ fontSize: '0.85rem', color: colors.textMuted, marginTop: '0.75rem' }}>
                    Point the camera at the QR code — it'll scan automatically.
                  </p>
                  <button onClick={handleCancelAssignQr} style={{ ...secondaryBtnStyle, marginTop: '0.5rem' }}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <label style={{ display: 'block', color: colors.white, fontWeight: 'bold', marginBottom: '0.35rem' }}>
                    QR Code
                  </label>
                  <input
                    type="text"
                    value={scannedQr}
                    readOnly
                    style={{
                      width: '100%', padding: '0.6rem', borderRadius: '6px', border: `0.5px solid ${colors.navyBorder}`,
                      background: colors.navyLight, color: colors.white, marginBottom: '0.75rem', boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button onClick={handleSubmitQr} style={btnStyle}>Submit</button>
                    <button onClick={handleRescanQr} style={secondaryBtnStyle}>Rescan</button>
                    <button onClick={handleCancelAssignQr} style={secondaryBtnStyle}>Cancel</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {message && (
          <p style={{ color: message.type === 'error' ? '#ff8080' : '#5FCF7A', marginTop: '1rem' }}>
            {message.text}
            {message.link && (
              <button
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
      </div>
    </div>
  );
}

export default ToolDetail;