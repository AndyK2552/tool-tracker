import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

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

function ToolStatus({ onHome, isAdmin }) {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);

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

    const interval = setInterval(() => {
      fetchTools();
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  const available = tools.filter((t) => !t.is_checked_out);
  const checkedOut = tools
  .filter((t) => t.is_checked_out)
  .sort((a, b) => new Date(a.checked_out_at) - new Date(b.checked_out_at));

  if (loading) return <p>Loading tool status...</p>;

  return (
    <div style={{ padding: '1rem' }}>
      <button onClick={onHome} style={{ marginBottom: '1rem' }}>
        {isAdmin ? 'Home' : 'Go to Scanner'}
      </button>
      <h1>Tool Status</h1>

      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '250px' }}>
          <h2>Available ({available.length})</h2>
          {available.length === 0 && <p>No tools currently available.</p>}
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {available.map((tool) => (
              <li key={tool.id} style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                <span style={{ color: 'green', marginRight: '0.5rem' }}>●</span>
                <strong>{tool.name}</strong>
                <br />
                <span style={{ fontSize: '0.85rem', color: '#666' }}>
                  {tool.id}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div style={{ flex: 1, minWidth: '250px' }}>
          <h2>Checked Out ({checkedOut.length})</h2>
          {checkedOut.length === 0 && <p>No tools currently checked out.</p>}
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {checkedOut.map((tool) => (
              <li key={tool.id} style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                <span style={{ color: 'red', marginRight: '0.5rem' }}>●</span>
                <strong>{tool.name}</strong>
                <br />
                <span style={{ fontSize: '0.85rem', color: '#666', marginLeft: '1.2rem' }}>
                    {tool.id}
                    <br />
                  Checked out by: {tool.checked_out_by}
                  {tool.condition === 'Damaged' ? ' — ⚠️ Damaged' : ''}
                  <br />
                  Duration: {formatDuration(tool.checked_out_at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default ToolStatus;