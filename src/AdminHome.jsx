function AdminHome({ onNavigate }) {
  const buttonStyle = {
    display: 'block',
    width: '100%',
    maxWidth: '300px',
    padding: '1rem',
    marginBottom: '0.75rem',
    fontSize: '1rem',
    textAlign: 'left',
    cursor: 'pointer',
  };

  return (
    <div style={{ padding: '1rem' }}>
      <h1>Admin Home</h1>
      <button style={buttonStyle} onClick={() => onNavigate('scanner')}>📷 Scan Tool</button>
      <button style={buttonStyle} onClick={() => onNavigate('status')}>📋 View Tools</button>
      <button style={buttonStyle} onClick={() => onNavigate('admin')}>➕ Add New Tool</button>
      <button style={buttonStyle} onClick={() => onNavigate('history')}>🕘 Checkout History</button>
    </div>
  );
}

export default AdminHome;