import { useEffect, useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from './supabaseClient';
import { useCameraCapture } from './useCameraCapture';
import { safeStopScanner, safePauseScanner, applyDefaultZoom } from './qrScannerUtils';
import { getToolStatus } from './toolStatus';
import { formatTechName } from './techDisplay';
import PageHeader from './PageHeader';
import { colors, btnStyle, secondaryBtnStyle } from './theme';
import { formatMacInput, MAC_PATTERN } from './macFormat';

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
  const [assigningBeacon, setAssigningBeacon] = useState(false);
  const [newBeaconMac, setNewBeaconMac] = useState('');
  const [scanningBeaconMac, setScanningBeaconMac] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [updatingPhoto, setUpdatingPhoto] = useState(false);
  const [newPhoto, setNewPhoto] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const scannerRef = useRef(null);
  const qrPanelRef = useRef(null);
  const locationPanelRef = useRef(null);
  const beaconPanelRef = useRef(null);
  const namePanelRef = useRef(null);
  const photoPanelRef = useRef(null);
  const messageRef = useRef(null);
  const { open: openPhotoCamera, error: photoCameraError, input: photoCameraInput } = useCameraCapture(setNewPhoto);

  useEffect(() => {
    if (message) messageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [message]);

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
    if (assigningBeacon) beaconPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [assigningBeacon]);

  useEffect(() => {
    if (!scanningBeaconMac) return;

    const scanner = new Html5Qrcode('beacon-qr-reader');
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10 },
        (decodedText) => {
          setNewBeaconMac(formatMacInput(decodedText));
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
    if (!tool?.id) return;
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('tools')
        .select('beacon_alarm_active, beacon_last_seen')
        .eq('id', tool.id)
        .single();
      if (data) setTool((t) => (t ? { ...t, ...data } : t));
    }, 10000);
    return () => clearInterval(interval);
  }, [tool?.id]);

  useEffect(() => {
    if (editingName) namePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [editingName]);

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
    const { data } = await supabase.from('profiles').select('name, truck_number').order('name');
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
          safePauseScanner(scanner, true);
          setScannedQr(decodedText);
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

  const handleStartAssignQr = () => {
    setScannedQr('');
    setMessage(null);
    setAssigningLocation(false);
    setAssigningBeacon(false);
    setScanningBeaconMac(false);
    setUpdatingPhoto(false);
    setEditingName(false);
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
    setEditingName(false);
    setAssigningBeacon(false);
    setScanningBeaconMac(false);
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

  const handleStartAssignBeacon = () => {
    setNewBeaconMac(tool.beacon_mac || '');
    setMessage(null);
    setAssigningQr(false);
    setAssigningLocation(false);
    setUpdatingPhoto(false);
    setEditingName(false);
    setAssigningBeacon(true);
  };

  const handleCancelAssignBeacon = () => {
    setAssigningBeacon(false);
    setScanningBeaconMac(false);
    setNewBeaconMac('');
  };

  const handleSubmitBeacon = async () => {
    const trimmedMac = newBeaconMac.trim();
    if (trimmedMac && !MAC_PATTERN.test(trimmedMac)) {
      setMessage({ type: 'error', text: 'Beacon MAC must look like AA:BB:CC:DD:EE:FF.' });
      return;
    }

    const { data, error } = await supabase
      .from('tools')
      .update({
        beacon_mac: trimmedMac ? trimmedMac.toUpperCase() : null,
        beacon_alarm_active: false,
        beacon_last_seen: null,
      })
      .eq('id', tool.id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        setMessage({ type: 'error', text: 'That beacon MAC is already assigned to another tool.' });
      } else {
        setMessage({ type: 'error', text: error.message });
      }
      return;
    }

    setTool(data);
    setAssigningBeacon(false);
    setScanningBeaconMac(false);
    setNewBeaconMac('');
    setMessage({ type: 'success', text: trimmedMac ? 'Beacon assigned.' : 'Beacon removed.' });
  };

  const handleStartEditName = () => {
    setNewName(tool.name || '');
    setMessage(null);
    setAssigningQr(false);
    setAssigningLocation(false);
    setAssigningBeacon(false);
    setScanningBeaconMac(false);
    setUpdatingPhoto(false);
    setEditingName(true);
  };

  const handleCancelEditName = () => {
    setEditingName(false);
    setNewName('');
  };

  const handleSubmitName = async () => {
    if (!newName.trim()) return;

    const { data, error } = await supabase
      .from('tools')
      .update({ name: newName.trim() })
      .eq('id', tool.id)
      .select()
      .single();

    if (error) {
      setMessage({ type: 'error', text: error.message });
      return;
    }

    setTool(data);
    setEditingName(false);
    setNewName('');
    setMessage({ type: 'success', text: 'Tool name updated.' });
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
    setAssigningBeacon(false);
    setScanningBeaconMac(false);
    setEditingName(false);
    setUpdatingPhoto(true);
    openPhotoCamera();
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

  const handleDelete = () => {
    setConfirmingDelete(true);
  };

  const confirmDelete = async () => {
    const { error } = await supabase.from('tools').delete().eq('id', tool.id);
    if (error) {
      setMessage({ type: 'error', text: error.message });
      setConfirmingDelete(false);
    } else {
      onBackToStatus();
    }
  };

  const handleReturn = async () => {
    const now = new Date().toISOString();
    const techWhoReturned = tool.checked_out_by;

    const { data, error } = await supabase
      .from('tools')
      .update({ is_checked_out: false, checked_out_at: null, condition: 'Pending' })
      .eq('id', tool.id)
      .select()
      .single();

    if (error) {
      setMessage({ type: 'error', text: error.message });
      return;
    }

    await supabase.from('tool_history').insert({
      tool_id: tool.id, tool_name: tool.name, action: 'returned', tech_name: techWhoReturned, timestamp: now, condition_change: 'Pending',
    });

    setTool(data);
    setMessage({ type: 'success', text: 'Tool returned — pending admin review.' });
  };

  const handleAcceptReturn = async () => {
    const { data, error } = await supabase
      .from('tools')
      .update({ condition: 'Ready', checked_out_by: null })
      .eq('id', tool.id)
      .select()
      .single();

    if (error) {
      setMessage({ type: 'error', text: error.message });
      return;
    }

    await supabase.from('tool_history').insert({
      tool_id: tool.id, tool_name: tool.name, action: 'return_accepted', tech_name: techProfile.name, timestamp: new Date().toISOString(), condition_change: 'Ready',
    });

    setTool(data);
    setMessage({ type: 'success', text: 'Return accepted — tool is now available.' });
  };

  const handleMarkDamaged = async () => {
    const { data, error } = await supabase
      .from('tools')
      .update({ condition: 'Damaged' })
      .eq('id', tool.id)
      .select()
      .single();

    if (error) {
      setMessage({ type: 'error', text: error.message });
      return;
    }

    await supabase.from('tool_history').insert({
      tool_id: tool.id, tool_name: tool.name, action: 'marked_damaged', tech_name: techProfile.name, timestamp: new Date().toISOString(), condition_change: 'Damaged',
    });

    setTool(data);
    setMessage({ type: 'success', text: 'Tool marked damaged.' });
  };

  const handleMarkRepaired = async () => {
    const { data, error } = await supabase
      .from('tools')
      .update({ condition: 'Ready', checked_out_by: null })
      .eq('id', tool.id)
      .select()
      .single();

    if (error) {
      setMessage({ type: 'error', text: error.message });
      return;
    }

    await supabase.from('tool_history').insert({
      tool_id: tool.id, tool_name: tool.name, action: 'marked_repaired', tech_name: techProfile.name, timestamp: new Date().toISOString(), condition_change: 'Ready',
    });

    setTool(data);
    setMessage({ type: 'success', text: 'Tool marked available again.' });
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


  if (loading) return (
    <div style={{ background: colors.navy, minHeight: '100vh', padding: '1.25rem' }}>
      <p style={{ color: colors.white }}>Loading...</p>
    </div>
  );
  if (!tool) return (
    <div style={{ background: colors.navy, minHeight: '100vh', padding: '1.25rem' }}>
      <p style={{ color: colors.white }}>Tool not found.</p>
    </div>
  );

  const status = getToolStatus(tool);
  const isHolder = tool.is_checked_out && tool.checked_out_by === techProfile?.name;
  const canManage = isAdmin || isHolder;

  return (
    <div style={{ background: colors.navy, minHeight: '100vh' }}>
      <PageHeader title="KYPD Tool Tracker" />

      <div style={{ padding: '1.25rem', maxWidth: '500px', margin: '0 auto' }}>
        <button onClick={isAdmin ? onHome : onBackToStatus} style={{ ...btnStyle, marginBottom: '1rem' }}>
          {isAdmin ? 'Home' : 'Back to Tool Status'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {isAdmin && (
            <button
              onClick={handleStartEditName}
              style={{ ...(editingName ? btnStyle : secondaryBtnStyle), padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
            >
              Edit
            </button>
          )}
          <h1 style={{ color: colors.white, fontSize: '20px', margin: 0 }}>{tool.name}</h1>
        </div>

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
          <p style={{ color: colors.textMuted }}><strong style={{ color: colors.white }}>Status:</strong> {status}</p>
          {tool.beacon_mac && (
            <p style={{ color: colors.textMuted }}>
              <strong style={{ color: colors.white }}>Beacon:</strong> {tool.beacon_mac}
              {tool.beacon_alarm_active && (
                <span style={{ color: '#ff8080', fontWeight: 'bold', marginLeft: '0.5rem' }}>⚠ Near door</span>
              )}
            </p>
          )}
          <p style={{ color: colors.textMuted }}>
            <strong style={{ color: colors.white }}>{status === 'Checked Out' ? 'Checked out by:' : 'Last returned by:'}</strong>{' '}
            {tool.checked_out_by
              ? formatTechName(tool.checked_out_by, techs.find((t) => t.name === tool.checked_out_by)?.truck_number)
              : '—'}
          </p>

          {status === 'Checked Out' ? (
            canManage ? (
              <button onClick={handleReturn} style={btnStyle}>Return</button>
            ) : (
              <button disabled title={`Only ${tool.checked_out_by} or an admin can return this tool`} style={{ ...btnStyle, opacity: 0.5 }}>
                Return
              </button>
            )
          ) : status === 'Available' ? (
            isAdmin ? (
              <div style={{ marginTop: '0.5rem' }}>
                <select
                  value={selectedTech}
                  onChange={(e) => setSelectedTech(e.target.value)}
                  style={{ padding: '0.5rem', marginRight: '0.5rem', borderRadius: '6px', border: 'none' }}
                >
                  <option value="">Select a tech...</option>
                  {techs.map((t) => (
                    <option key={t.name} value={t.name}>{formatTechName(t.name, t.truck_number)}</option>
                  ))}
                </select>
                <button onClick={() => handleCheckOut(selectedTech)} style={{ ...btnStyle, marginTop: 0 }}>Check Out</button>
              </div>
            ) : (
              <button onClick={() => handleCheckOut(techProfile.name)} style={btnStyle}>Check Out</button>
            )
          ) : status === 'Pending' ? (
            isAdmin ? (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button onClick={handleAcceptReturn} style={btnStyle}>Accept Return</button>
                <button onClick={handleMarkDamaged} style={{ ...secondaryBtnStyle, color: '#ff8080' }}>Mark Damaged</button>
              </div>
            ) : (
              <p style={{ color: colors.textMuted, fontStyle: 'italic' }}>
                This tool is awaiting admin review before it can be checked out again.
              </p>
            )
          ) : (
            isAdmin ? (
              <button onClick={handleMarkRepaired} style={btnStyle}>Mark Repaired / Available</button>
            ) : (
              <p style={{ color: '#ff8080', fontStyle: 'italic' }}>
                This tool is marked damaged and can't be checked out.
              </p>
            )
          )}

          {canManage && (
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              {isAdmin && (
                <button onClick={handleStartAssignQr} style={{ ...(assigningQr ? btnStyle : secondaryBtnStyle), marginTop: 0 }}>
                  Assign QR Code
                </button>
              )}
              <button onClick={handleStartAssignLocation} style={{ ...(assigningLocation ? btnStyle : secondaryBtnStyle), marginTop: 0 }}>
                Assign Location
              </button>
              {isAdmin && (
                <button onClick={handleStartAssignBeacon} style={{ ...(assigningBeacon ? btnStyle : secondaryBtnStyle), marginTop: 0 }}>
                  {tool.beacon_mac ? 'Edit Beacon' : 'Assign Beacon'}
                </button>
              )}
              {isAdmin && (
                <button onClick={handleStartUpdatePhoto} style={{ ...(updatingPhoto ? btnStyle : secondaryBtnStyle), marginTop: 0 }}>
                  Update Photo
                </button>
              )}
              {isAdmin && (
                <button onClick={handleDelete} style={{ ...secondaryBtnStyle, color: '#ff8080', marginTop: 0 }}>
                  Delete Tool
                </button>
              )}
            </div>
          )}

          {isAdmin && updatingPhoto && (
            <div ref={photoPanelRef} style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: `0.5px solid ${colors.navyBorder}` }}>
              {!newPhoto ? (
                <>
                  <p style={{ color: colors.textMuted }}>Opening camera...</p>
                  {photoCameraError && <p style={{ color: '#ff8080' }}>{photoCameraError}</p>}
                  <button onClick={handleCancelUpdatePhoto} style={secondaryBtnStyle}>Cancel</button>
                </>
              ) : (
                <>
                  <img
                    src={`data:image/jpeg;base64,${newPhoto}`}
                    alt="New tool"
                    style={{ width: '100%', maxWidth: '250px', borderRadius: '8px', display: 'block', margin: '0 auto 0.75rem' }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button onClick={handleSubmitPhoto} disabled={uploadingPhoto} style={btnStyle}>
                      {uploadingPhoto ? 'Uploading...' : 'Submit'}
                    </button>
                    <button onClick={() => { setNewPhoto(null); openPhotoCamera(); }} style={secondaryBtnStyle}>Retake</button>
                    <button onClick={handleCancelUpdatePhoto} style={secondaryBtnStyle}>Cancel</button>
                  </div>
                </>
              )}
            </div>
          )}
          {photoCameraInput}

          {isAdmin && editingName && (
            <div ref={namePanelRef} style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: `0.5px solid ${colors.navyBorder}` }}>
              <label style={{ display: 'block', color: colors.white, fontWeight: 'bold', marginBottom: '0.35rem' }}>
                Tool Name
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={{
                  width: '100%', padding: '0.6rem', borderRadius: '6px', border: 'none', marginBottom: '0.75rem', boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button onClick={handleSubmitName} style={btnStyle}>Submit</button>
                <button onClick={handleCancelEditName} style={secondaryBtnStyle}>Cancel</button>
              </div>
            </div>
          )}

          {canManage && assigningLocation && (
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

          {isAdmin && assigningBeacon && (
            <div ref={beaconPanelRef} style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: `0.5px solid ${colors.navyBorder}` }}>
              <label style={{ display: 'block', color: colors.white, fontWeight: 'bold', marginBottom: '0.35rem' }}>
                Beacon MAC Address
              </label>
              <input
                type="text"
                value={newBeaconMac}
                onChange={(e) => setNewBeaconMac(formatMacInput(e.target.value))}
                placeholder="AA:BB:CC:DD:EE:FF"
                style={{
                  width: '100%', padding: '0.6rem', borderRadius: '6px', border: 'none', marginBottom: '0.5rem', boxSizing: 'border-box',
                }}
              />
              <button
                type="button"
                onClick={() => setScanningBeaconMac((v) => !v)}
                style={{ ...(scanningBeaconMac ? btnStyle : secondaryBtnStyle), marginTop: 0, marginBottom: '0.75rem' }}
              >
                {scanningBeaconMac ? 'Cancel Scan' : 'Scan Beacon QR Code'}
              </button>
              {scanningBeaconMac && (
                <div id="beacon-qr-reader" style={{ width: '100%', marginBottom: '0.75rem' }}></div>
              )}
              <p style={{ fontSize: '0.8rem', color: colors.textMuted, marginTop: 0, marginBottom: '0.75rem' }}>
                The board sits at the shop door and sounds the buzzer when this tool is Available and its beacon gets close. The alarm distance is set once for all tools in Beacon Settings, not per tool. Leave the MAC blank and submit to remove the beacon.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button onClick={handleSubmitBeacon} style={btnStyle}>Submit</button>
                <button onClick={handleCancelAssignBeacon} style={secondaryBtnStyle}>Cancel</button>
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
          <p ref={messageRef} style={{ color: message.type === 'error' ? '#ff8080' : '#5FCF7A', marginTop: '1rem' }}>
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

      {confirmingDelete && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem', zIndex: 1000,
          }}
        >
          <div
            style={{
              background: colors.navy, border: `0.5px solid ${colors.navyBorder}`, borderRadius: '12px',
              padding: '1.5rem', maxWidth: '360px', width: '100%',
            }}
          >
            <h2 style={{ color: colors.white, fontSize: '18px', margin: '0 0 0.75rem' }}>Delete Tool</h2>
            <p style={{ color: colors.textMuted, margin: 0 }}>
              Are you sure you want to delete "{tool.name}"? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button onClick={() => setConfirmingDelete(false)} style={secondaryBtnStyle}>Cancel</button>
              <button onClick={confirmDelete} style={{ ...btnStyle, background: '#E0645A', color: colors.white }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ToolDetail;