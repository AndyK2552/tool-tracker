import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { colors } from './theme';
import PageHeader from './PageHeader';

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

function ToolStatus({ onHome, onSelectTool, isAdmin, techName }) {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [locationFilter, setLocationFilter] = useState('All');

  const fetchTools = async () => {
    const { data, error } = await supabase
      .from('tools')
      .select('*')
      .order('name', { ascending: true });

    if (!error && data) {
      setTools(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTools();
    const interval = setInterval(fetchTools, 15000);
    return () => clearInterval(interval);
  }, []);

  const locationFilteredTools = tools.filter((t) => {
    if (locationFilter === 'All') return true;
    if (locationFilter === 'My Tools') return t.checked_out_by === techName;
    return t.location === locationFilter;
  });
  const available = locationFilteredTools.filter((t) => !t.is_checked_out);
  const checkedOut = locationFilteredTools
    .filter((t) => t.is_checked_out)
    .sort((a, b) => new Date(a.checked_out_at) - new Date(b.checked_out_at));

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

  const thumbnailPlaceholderStyle = {
    ...thumbnailStyle,
    background: colors.navyBorder,
  };

  if (loading) return (
  <div style={{ background: colors.navy, minHeight: '100vh', padding: '1rem' }}>
    <p style={{ color: colors.white }}>Loading tool status...</p>
  </div>
);

  return (
    <div style={{ background: colors.navy, minHeight: '100vh' }}>
      <PageHeader title="KYPD Tool Tracker" />

      <div style={{ padding: '1.25rem' }}>
        <button
          onClick={onHome}
          style={{ marginBottom: '1rem', padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: colors.gold, color: colors.navy, fontWeight: 'bold', cursor: 'pointer' }}
        >
          {isAdmin ? 'Home' : 'Go to Scanner'}
        </button>

        <h1 style={{ color: colors.white, fontSize: '20px' }}>Tool Status</h1>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {['All', 'Truck', 'Shop', 'My Tools'].map((option) => (
            <button
              key={option}
              onClick={() => setLocationFilter(option)}
              style={{
                padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold',
                border: `0.5px solid ${colors.navyBorder}`,
                background: locationFilter === option ? colors.gold : colors.navyLight,
                color: locationFilter === option ? colors.navy : colors.white,
              }}
            >
              {option}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '250px' }}>
            <h2 style={{ color: colors.white, fontSize: '16px' }}>Available ({available.length})</h2>
            {available.length === 0 && <p style={{ color: colors.textMuted }}>No tools currently available.</p>}
            {available.map((tool) => (
              <div key={tool.id} onClick={() => onSelectTool(tool.id)} style={{ ...cardStyle, display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                {tool.image_url ? (
                  <img src={tool.image_url} alt={tool.name} style={thumbnailStyle} />
                ) : (
                  <div style={thumbnailPlaceholderStyle} />
                )}
                <div>
                  <span style={{ color: '#5FCF7A', marginRight: '0.5rem' }}>●</span>
                  <strong style={{ color: colors.white }}>{tool.name}</strong>
                  <p style={{ fontSize: '0.85rem', color: colors.textMuted, margin: '4px 0 0' }}>{tool.id}</p>
                </div>
              </div>
            ))}
          </div>

          <div style={{ flex: 1, minWidth: '250px' }}>
            <h2 style={{ color: colors.white, fontSize: '16px' }}>Checked Out ({checkedOut.length})</h2>
            {checkedOut.length === 0 && <p style={{ color: colors.textMuted }}>No tools currently checked out.</p>}
            {checkedOut.map((tool) => (
              <div key={tool.id} onClick={() => onSelectTool(tool.id)} style={{ ...cardStyle, display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                {tool.image_url ? (
                  <img src={tool.image_url} alt={tool.name} style={thumbnailStyle} />
                ) : (
                  <div style={thumbnailPlaceholderStyle} />
                )}
                <div>
                  <span style={{ color: '#E0645A', marginRight: '0.5rem' }}>●</span>
                  <strong style={{ color: colors.white }}>{tool.name}</strong>
                  <p style={{ fontSize: '0.85rem', color: colors.textMuted, margin: '4px 0 0' }}>
                    {tool.id}<br />
                    Checked out by: {tool.checked_out_by}
                    {tool.condition === 'Damaged' ? ' — ⚠️ Damaged' : ''}<br />
                    Duration: {formatDuration(tool.checked_out_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ToolStatus;