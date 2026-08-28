import { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import { supabase } from './supabaseClient';
import PageHeader from './PageHeader';
import { colors, btnStyle, secondaryBtnStyle } from './theme';

const SOUND_BUCKET = 'rfid_sounds';

// The board polls Supabase roughly every second (see COMMAND_POLL_INTERVAL_MS
// in i2s-speaker-test.ino) and heartbeats board_last_seen on every cycle --
// missing that for 10s means it's gone offline, not just between polls.
const BOARD_OFFLINE_THRESHOLD_MS = 10 * 1000;

function SpeakerTest({ onHome }) {
  const [files, setFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [state, setState] = useState(null);
  const [message, setMessage] = useState(null);
  const [localVolume, setLocalVolume] = useState(20);
  const [displayPosition, setDisplayPosition] = useState(0);
  const commandSeqRef = useRef(0);
  const volumeDebounceRef = useRef(null);
  const isScrubbingRef = useRef(false);

  useEffect(() => {
    const fetchFiles = async () => {
      const { data, error } = await supabase.storage.from(SOUND_BUCKET).list();
      if (error) {
        setMessage({ type: 'error', text: `Could not list sounds: ${error.message}` });
      } else {
        setFiles((data || []).filter((f) => f.name.toLowerCase().endsWith('.wav')));
      }
      setLoadingFiles(false);
    };
    fetchFiles();
  }, []);

  useEffect(() => {
    const fetchState = async () => {
      const { data } = await supabase.from('speaker_test').select('*').eq('id', true).single();
      if (data) {
        setState(data);
        commandSeqRef.current = data.command_seq;
        setLocalVolume(data.volume);
      }
    };
    fetchState();

    // Realtime keeps the UI in sync with what the board is actually doing
    // (status flips to "playing"/"paused"/"idle" as it acts on commands and
    // as playback finishes on its own) without the browser having to poll.
    // Requires speaker_test to be added to the supabase_realtime publication
    // -- see sql/enable_realtime_for_speaker_test.sql -- creating the table
    // alone does NOT start broadcasting its changes.
    const channel = supabase
      .channel('speaker_test_changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'speaker_test' }, (payload) => {
        setState(payload.new);
        commandSeqRef.current = Math.max(commandSeqRef.current, payload.new.command_seq);
      })
      .subscribe();

    // Belt-and-suspenders fallback: re-fetch periodically regardless of
    // Realtime, so a dropped/never-connected websocket (flaky shop WiFi,
    // a misconfigured publication) can't leave the UI permanently stuck
    // showing stale state -- it self-corrects within a few seconds either way.
    const pollInterval = setInterval(fetchState, 3000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, []);

  const sendCommand = async (action, soundPath) => {
    const nextSeq = commandSeqRef.current + 1;
    commandSeqRef.current = nextSeq;
    const { data, error } = await supabase
      .from('speaker_test')
      .update({ action, sound_path: soundPath ?? state?.sound_path ?? null, command_seq: nextSeq })
      .eq('id', true)
      .select()
      .single();

    if (error) {
      setMessage({ type: 'error', text: error.message });
      return;
    }
    setState(data);
  };

  const handlePlay = (file) => sendCommand('play', file.name);
  const handlePause = () => sendCommand('pause');

  // The board only reports position once per ~1s poll cycle -- ticking it
  // forward locally between updates makes the scrubber move smoothly
  // instead of jumping once a second. Each real update from the board
  // (via Realtime) resnaps displayPosition to the true value, so drift
  // never accumulates for more than a second.
  useEffect(() => {
    if (isScrubbingRef.current) return;
    setDisplayPosition(state?.position_seconds || 0);
  }, [state?.position_seconds]);

  useEffect(() => {
    if (state?.status !== 'playing') return;
    const interval = setInterval(() => {
      if (isScrubbingRef.current) return;
      setDisplayPosition((p) => Math.min(p + 0.25, state.duration_seconds || p));
    }, 250);
    return () => clearInterval(interval);
  }, [state?.status, state?.duration_seconds]);

  const handleScrubChange = (e) => {
    isScrubbingRef.current = true;
    setDisplayPosition(Number(e.target.value));
  };

  const commitScrub = async (e) => {
    isScrubbingRef.current = false;
    const seconds = Number(e.target.value);
    const nextSeq = commandSeqRef.current + 1;
    commandSeqRef.current = nextSeq;
    const { data, error } = await supabase
      .from('speaker_test')
      .update({ action: 'seek', seek_seconds: seconds, command_seq: nextSeq })
      .eq('id', true)
      .select()
      .single();
    if (error) {
      setMessage({ type: 'error', text: error.message });
      return;
    }
    setState(data);
  };

  const formatTime = (seconds) => {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const total = Math.floor(seconds);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  // Updates the slider instantly for a responsive feel, but only writes to
  // Supabase after the user stops dragging -- the board applies volume on
  // every ~1s poll regardless of command_seq, so there's no reason to spam
  // it with a write per pixel of drag.
  const handleVolumeChange = (e) => {
    const v = Number(e.target.value);
    setLocalVolume(v);
    clearTimeout(volumeDebounceRef.current);
    volumeDebounceRef.current = setTimeout(async () => {
      const { error } = await supabase.from('speaker_test').update({ volume: v }).eq('id', true);
      if (error) setMessage({ type: 'error', text: error.message });
    }, 300);
  };

  useEffect(() => () => clearTimeout(volumeDebounceRef.current), []);

  const boardOnline = state?.board_last_seen && Date.now() - new Date(state.board_last_seen).getTime() < BOARD_OFFLINE_THRESHOLD_MS;

  const boardStatusStyle = {
    display: 'flex', alignItems: 'center', gap: '8px',
    background: colors.navyLight, border: `0.5px solid ${colors.navyBorder}`, borderRadius: '8px',
    padding: '10px 12px', marginBottom: '1.25rem', fontSize: '13px',
  };

  const rowStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: colors.navyLight, border: `0.5px solid ${colors.navyBorder}`, borderRadius: '8px',
    padding: '0.75rem', marginBottom: '0.5rem',
  };

  return (
    <div style={{ background: colors.navy, minHeight: '100vh' }}>
      <PageHeader title="KYPD Tool Tracker" />

      <div style={{ padding: '1.25rem', maxWidth: '500px', margin: '0 auto' }}>
        <button onClick={onHome} style={{ ...btnStyle, marginBottom: '1rem' }}>Home</button>

        <h1 style={{ color: colors.white, fontSize: '20px' }}>Speaker Test</h1>

        <div style={boardStatusStyle}>
          {!state?.board_last_seen ? (
            <span style={{ color: colors.textMuted }}>Board: status not yet reported</span>
          ) : !boardOnline ? (
            <span style={{ color: '#ff8080', fontWeight: 'bold' }}>
              ⚠ Board offline — last seen {new Date(state.board_last_seen).toLocaleTimeString()}
            </span>
          ) : (
            <span style={{ color: colors.textMuted }}>
              Board online — {state.status}
              {state.status === 'error' && state.status_detail ? `: ${state.status_detail}` : ''}
            </span>
          )}
        </div>

        {state?.sound_path && state.status !== 'idle' && (
          <div style={{
            background: colors.navyLight, border: `0.5px solid ${colors.navyBorder}`, borderRadius: '8px',
            padding: '0.85rem', marginBottom: '1.25rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', gap: '0.5rem' }}>
              <strong style={{ color: colors.white, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {state.sound_path}
              </strong>
              <button
                onClick={() => (state.status === 'playing' ? handlePause() : handlePlay({ name: state.sound_path }))}
                disabled={state.status === 'downloading'}
                style={{ ...secondaryBtnStyle, marginTop: 0, padding: '0.4rem 0.6rem', flexShrink: 0 }}
              >
                {state.status === 'playing' ? <Pause size={16} /> : <Play size={16} />}
              </button>
            </div>
            <input
              type="range"
              min="0"
              max={state.duration_seconds || 0}
              step="0.1"
              value={Math.min(displayPosition, state.duration_seconds || 0)}
              onChange={handleScrubChange}
              onMouseUp={commitScrub}
              onTouchEnd={commitScrub}
              disabled={state.status === 'downloading'}
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: colors.textMuted, marginTop: '0.15rem' }}>
              <span>{formatTime(displayPosition)}</span>
              <span>{formatTime(state.duration_seconds)}</span>
            </div>
          </div>
        )}

        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', color: colors.white, fontSize: '14px', marginBottom: '0.35rem' }}>
            Volume: {localVolume}%
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={localVolume}
            onChange={handleVolumeChange}
            style={{ width: '100%' }}
          />
        </div>

        {message && (
          <p style={{ color: message.type === 'error' ? '#ff8080' : '#5FCF7A', marginBottom: '1rem' }}>
            {message.text}
          </p>
        )}

        {loadingFiles ? (
          <p style={{ color: colors.textMuted }}>Loading sounds...</p>
        ) : files.length === 0 ? (
          <p style={{ color: colors.textMuted }}>No .wav files found in the "{SOUND_BUCKET}" bucket.</p>
        ) : (
          files.map((file) => {
            const isSelected = state?.sound_path === file.name;
            const isPlaying = isSelected && state?.status === 'playing';
            const isDownloading = isSelected && state?.status === 'downloading';

            return (
              <div key={file.name} style={rowStyle}>
                <span style={{ color: colors.white, fontSize: '0.9rem' }}>{file.name}</span>
                <button
                  onClick={() => (isPlaying ? handlePause() : handlePlay(file))}
                  disabled={isDownloading}
                  style={{
                    ...secondaryBtnStyle, marginTop: 0, padding: '0.4rem 0.75rem',
                    display: 'flex', alignItems: 'center', gap: '6px',
                    opacity: isDownloading ? 0.6 : 1,
                  }}
                >
                  {isDownloading ? (
                    'Downloading...'
                  ) : isPlaying ? (
                    <><Pause size={16} /> Pause</>
                  ) : (
                    <><Play size={16} /> Play</>
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default SpeakerTest;
