import { Camera, ClipboardList, Plus, Clock } from 'lucide-react';
import { colors } from './theme';
import PageHeader from './PageHeader';

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
  ];

  return (
    <div style={{ background: colors.navy, minHeight: '100vh' }}>
      <PageHeader title="KYPD Tool Tracker" />

      <div style={{ padding: '1.25rem' }}>
        <p style={{ fontSize: '12px', color: colors.textMuted, margin: '0 0 4px' }}>Admin home</p>
        <p style={{ fontSize: '18px', fontWeight: 500, color: colors.white, margin: '0 0 1.25rem' }}>
          Good morning, {techName}
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