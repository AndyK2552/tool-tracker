import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import PageHeader from './PageHeader';
import { colors, btnStyle } from './theme';

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

      <div style={{ padding: '1.25rem' }}>
        <button onClick={onBackToUsers} style={{ ...btnStyle, marginBottom: '1rem', marginRight: '0.5rem' }}>
          Back to Manage Users
        </button>
        <button onClick={onHome} style={{ ...btnStyle, marginBottom: '1rem' }}>
          Home
        </button>

        <div style={{ background: colors.navyLight, border: `0.5px solid ${colors.navyBorder}`, borderRadius: '8px', padding: '1rem', maxWidth: '400px', marginBottom: '1.5rem' }}>
          <h1 style={{ color: colors.white, fontSize: '20px', margin: '0 0 0.5rem' }}>{user.name}</h1>
          <p style={{ color: colors.textMuted, margin: '0 0 4px' }}>{user.email}</p>
          <p style={{ color: colors.textMuted, margin: 0 }}>{user.is_admin ? 'Admin' : 'Tech'}</p>
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
                {tool.id}
                {tool.condition === 'Damaged' ? ' — ⚠️ Damaged' : ''}<br />
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
