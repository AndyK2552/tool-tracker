import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { formatTechName } from './techDisplay';
import PageHeader from './PageHeader';
import { colors, btnStyle, secondaryBtnStyle } from './theme';

const formatDuration = (checkedOutAt) => {
  const utcString = checkedOutAt.endsWith('Z') ? checkedOutAt : checkedOutAt + 'Z';
  const start = new Date(utcString);
  const now = new Date();
  const diffMs = now - start;

  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);

  return parts.join(' ');
};

function UserDetail({ userId, onHome, onBackToUsers, onSelectTool }) {
  const [user, setUser] = useState(null);
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editTruckNumber, setEditTruckNumber] = useState('');
  const [editIsAdmin, setEditIsAdmin] = useState(false);
  const [message, setMessage] = useState(null);

  const fetchData = async () => {
    const { data: userData } = await supabase.from('profiles').select('*').eq('id', userId).single();
    setUser(userData);

    if (userData) {
      const { data: toolsData } = await supabase
        .from('tools')
        .select('*')
        .eq('checked_out_by', userData.name)
        .eq('is_checked_out', true)
        .order('checked_out_at', { ascending: true });
      setTools(toolsData || []);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [userId]);

  const startEdit = () => {
    setEditName(user.name || '');
    setEditEmail(user.email || '');
    setEditTruckNumber(user.truck_number || '');
    setEditIsAdmin(!!user.is_admin);
    setMessage(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const saveEdit = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .update({ name: editName.trim(), email: editEmail.trim(), truck_number: editTruckNumber.trim(), is_admin: editIsAdmin })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      setMessage({ type: 'error', text: error.message });
      return;
    }

    setUser(data);
    setEditing(false);
    setMessage({ type: 'success', text: 'User updated.' });
  };

  const cardStyle = {
    background: colors.navyLight,
    border: `0.5px solid ${colors.navyBorder}`,
    borderRadius: '8px',
    padding: '0.75rem',
    marginBottom: '0.5rem',
    cursor: 'pointer',
  };

  const thumbnailStyle = {
    width: '44px',
    height: '44px',
    borderRadius: '6px',
    objectFit: 'cover',
    flexShrink: 0,
  };

  const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '6px', border: 'none', marginBottom: '0.5rem' };
  const labelStyle = { display: 'block', color: colors.white, fontSize: '13px', marginBottom: '0.25rem' };

  if (loading) return (
    <div style={{ background: colors.navy, minHeight: '100vh', padding: '1.25rem' }}>
      <p style={{ color: colors.white }}>Loading...</p>
    </div>
  );

  if (!user) return (
    <div style={{ background: colors.navy, minHeight: '100vh', padding: '1.25rem' }}>
      <p style={{ color: colors.white }}>User not found.</p>
    </div>
  );

  return (
    <div style={{ background: colors.navy, minHeight: '100vh' }}>
      <PageHeader title="KYPD Tool Tracker" />

      <div style={{ padding: '1.25rem', maxWidth: '500px', margin: '0 auto' }}>
        <button onClick={onBackToUsers} style={{ ...btnStyle, marginBottom: '1rem', marginRight: '0.5rem' }}>
          Back to Manage Users
        </button>
        <button onClick={onHome} style={{ ...btnStyle, marginBottom: '1rem' }}>
          Home
        </button>

        {message && (
          <p style={{ color: message.type === 'error' ? '#ff8080' : '#5FCF7A', marginBottom: '1rem' }}>
            {message.text}
          </p>
        )}

        <div style={{ background: colors.navyLight, border: `0.5px solid ${colors.navyBorder}`, borderRadius: '8px', padding: '1rem', maxWidth: '400px', marginBottom: '1.5rem' }}>
          {editing ? (
            <>
              <label style={labelStyle}>Name</label>
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} style={inputStyle} />

              <label style={labelStyle}>Email</label>
              <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} style={inputStyle} />

              <label style={labelStyle}>Truck Number</label>
              <input type="text" value={editTruckNumber} onChange={(e) => setEditTruckNumber(e.target.value)} style={inputStyle} />

              <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
                <input type="checkbox" checked={editIsAdmin} onChange={(e) => setEditIsAdmin(e.target.checked)} />
                Admin
              </label>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button onClick={saveEdit} style={btnStyle}>Save</button>
                <button onClick={cancelEdit} style={secondaryBtnStyle}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <h1 style={{ color: colors.white, fontSize: '20px', margin: '0 0 0.5rem' }}>{formatTechName(user.name, user.truck_number)}</h1>
              <p style={{ color: colors.textMuted, margin: '0 0 4px' }}>{user.email}</p>
              <p style={{ color: colors.textMuted, margin: '0 0 0.75rem' }}>{user.is_admin ? 'Admin' : 'Tech'}</p>
              <button onClick={startEdit} style={secondaryBtnStyle}>Edit</button>
            </>
          )}
        </div>

        <h2 style={{ color: colors.white, fontSize: '16px' }}>Checked Out Tools ({tools.length})</h2>
        {tools.length === 0 && <p style={{ color: colors.textMuted }}>No tools currently checked out.</p>}
        {tools.map((tool) => (
          <div key={tool.id} onClick={() => onSelectTool(tool.id)} style={{ ...cardStyle, display: 'flex', gap: '0.75rem', alignItems: 'flex-start', maxWidth: '400px' }}>
            {tool.image_url ? (
              <img src={tool.image_url} alt={tool.name} style={thumbnailStyle} />
            ) : (
              <div style={{ ...thumbnailStyle, background: colors.navyBorder }} />
            )}
            <div>
              <strong style={{ color: colors.white }}>{tool.name}</strong>
              <p style={{ fontSize: '0.85rem', color: colors.textMuted, margin: '4px 0 0' }}>
                {tool.id}<br />
                Duration: {formatDuration(tool.checked_out_at)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default UserDetail;
