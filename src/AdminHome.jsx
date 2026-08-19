import { Camera, ClipboardList, Plus, Clock, Users } from 'lucide-react';
import { colors } from './theme';
import PageHeader from './PageHeader';

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

function AdminHome({ onNavigate, techName }) {
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
  ];

  return (
    <div style={{ background: colors.navy, minHeight: '100vh' }}>
      <PageHeader title="KYPD Tool Tracker" />

      <div style={{ padding: '1.25rem', maxWidth: '500px', margin: '0 auto' }}>
        <p style={{ fontSize: '18px', fontWeight: 500, color: colors.white, margin: '0 0 4px' }}>
        {getGreeting()}, {techName}
        </p>
        <p style={{ fontSize: '20px', fontWeight: 'bold', color: colors.gold, margin: '0 0 1.25rem' }}>
          Admin Home
      </p>

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