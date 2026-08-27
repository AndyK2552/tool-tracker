import { useEffect, useState } from 'react';
import { Camera, ClipboardList, Plus, Clock, Users, Radio, Scan, Tag } from 'lucide-react';
import { formatTechName } from './techDisplay';
import { supabase } from './supabaseClient';
import { colors } from './theme';
import PageHeader from './PageHeader';
import { BEACON_FEATURE_ENABLED, RFID_FEATURE_ENABLED, RFID_TAG_ASSIGNMENT_ENABLED } from './featureFlags';

// The board heartbeats roughly every 5s while online (see sendHeartbeat()
// in shop-beacon-monitor.ino) -- missing that for 2+ minutes is a clear
// signal something's wrong, well before the 10-minute mark where the
// check-board-heartbeat Edge Function emails admins about it.
const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000;
const REFRESH_INTERVAL_MS = 30 * 1000;

const isBoardOffline = (lastSeen) => Date.now() - lastSeen.getTime() >= OFFLINE_THRESHOLD_MS;

const formatMinutesAgo = (lastSeen) => {
  const minutes = Math.floor((Date.now() - lastSeen.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? '1 hr ago' : `${hours} hr ago`;
};

const getGreeting = () => {
  const hour = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      hour12: false,
    }).format(new Date()),
    10
  );

  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

function AdminHome({ onNavigate, techName, truckNumber }) {
  const [boardLastSeen, setBoardLastSeen] = useState(undefined); // undefined = loading, null = never reported

  useEffect(() => {
    if (!BEACON_FEATURE_ENABLED) return;
    const fetchBoardStatus = async () => {
      const { data } = await supabase.from('beacon_settings').select('board_last_seen').eq('id', true).single();
      setBoardLastSeen(data?.board_last_seen ? new Date(data.board_last_seen) : null);
    };
    fetchBoardStatus();
    const interval = setInterval(fetchBoardStatus, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const cardStyle = {
    background: colors.navyLight,
    border: `0.5px solid ${colors.navyBorder}`,
    borderRadius: '8px',
    padding: '14px 12px',
    cursor: 'pointer',
    textAlign: 'left',
    aspectRatio: '1 / 1',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  };

  const buttons = [
    { key: 'scanner', icon: Camera, label: 'Check out tool' },
    { key: 'status', icon: ClipboardList, label: 'Manage tools' },
    { key: 'admin', icon: Plus, label: 'Add new tool' },
    { key: 'history', icon: Clock, label: 'Checkout history' },
    { key: 'users', icon: Users, label: 'Manage users' },
    ...(BEACON_FEATURE_ENABLED ? [{ key: 'beaconSettings', icon: Radio, label: 'Beacon settings' }] : []),
    ...(RFID_FEATURE_ENABLED ? [{ key: 'rfidReconciliation', icon: Scan, label: 'RFID reconciliation' }] : []),
    ...(RFID_TAG_ASSIGNMENT_ENABLED ? [{ key: 'rfidTagAssignment', icon: Tag, label: 'Assign RFID tags' }] : []),
  ];

  return (
    <div style={{ background: colors.navy, minHeight: '100vh' }}>
      <PageHeader title="KYPD Tool Tracker" />

      <div style={{ padding: '1.25rem', maxWidth: '500px', margin: '0 auto' }}>
        <p style={{ fontSize: '18px', fontWeight: 500, color: colors.white, margin: '0 0 4px' }}>
        {getGreeting()}, {formatTechName(techName, truckNumber)}
        </p>
        <p style={{ fontSize: '20px', fontWeight: 'bold', color: colors.gold, margin: '0 0 1.25rem' }}>
          Admin Home
      </p>

        {BEACON_FEATURE_ENABLED && boardLastSeen !== undefined && (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: colors.navyLight, border: `0.5px solid ${colors.navyBorder}`, borderRadius: '8px',
              padding: '10px 12px', marginBottom: '1.25rem', fontSize: '13px',
            }}
          >
            {boardLastSeen === null ? (
              <span style={{ color: colors.textMuted }}>Beacon Tower: status not yet reported</span>
            ) : isBoardOffline(boardLastSeen) ? (
              <span style={{ color: '#ff8080', fontWeight: 'bold' }}>
                ⚠ Beacon Tower offline — last seen {formatMinutesAgo(boardLastSeen)}
              </span>
            ) : (
              <span style={{ color: colors.textMuted }}>
                Beacon Tower online — last seen {formatMinutesAgo(boardLastSeen)}
              </span>
            )}
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0,1fr))',
            gap: '10px',
          }}
        >
          {buttons.map((b) => {
            const Icon = b.icon;
            return (
              <button key={b.key} onClick={() => onNavigate(b.key)} style={cardStyle}>
                <Icon size={22} color={colors.blueAccent} />
                <p style={{ fontSize: '13px', fontWeight: 500, margin: 0, color: colors.white }}>
                  {b.label}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default AdminHome;