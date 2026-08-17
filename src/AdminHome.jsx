import { colors } from './theme';
import PageHeader from './PageHeader';

function AdminHome({ onNavigate }) {
  const cardStyle = {
    background: colors.navyLight,
    border: `0.5px solid ${colors.navyBorder}`,
    borderRadius: '8px',
    padding: '14px 12px',
    cursor: 'pointer',
    textAlign: 'left',
  };

  const buttons = [
    { key: 'scanner', icon: '📷', label: 'Check out tool' },
    { key: 'status', icon: '📋', label: 'Manage tools' },
    { key: 'admin', icon: '➕', label: 'Add new tool' },
    { key: 'history', icon: '🕘', label: 'Checkout history' },
  ];

  return (
    <div style={{ background: colors.navy, minHeight: '100vh' }}>
      <PageHeader title="KYPD Tool Tracker" />

      <div style={{ padding: '1.25rem' }}>
        <p style={{ fontSize: '12px', color: colors.textMuted, margin: '0 0 4px' }}>Admin home</p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0,1fr))',
            gap: '10px',
            marginTop: '1rem',
          }}
        >
          {buttons.map((b) => (
            <button key={b.key} onClick={() => onNavigate(b.key)} style={cardStyle}>
              <div style={{ fontSize: '22px', color: colors.blueAccent }}>{b.icon}</div>
              <p style={{ fontSize: '13px', fontWeight: 500, margin: '10px 0 0', color: colors.white }}>
                {b.label}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AdminHome;