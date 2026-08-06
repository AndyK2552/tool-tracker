import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

function ToolStatus({ onBack, onAddTool, isAdmin }) {
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
    fetchTools(); // initial load

    const interval = setInterval(() => {
      fetchTools();
    }, 15000); // refresh every 15 seconds

    return () => clearInterval(interval);
  }, []);

  const available = tools.filter((t) => !t.is_checked_out);
  const checkedOut = tools.filter((t) => t.is_checked_out);

  if (loading) return <p>Loading tool status...</p>;

  return (
    <div style={{ padding: '1rem' }}>
      <button onClick={onBack} style={{ marginBottom: '1rem' }}>Go to Scanner</button>
      {isAdmin && (
        <button onClick={onAddTool} style={{ marginBottom: '1rem', marginLeft: '0.5rem' }}>Add New Tool</button>
        )}
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
                <span style={{ fontSize: '0.85rem', color: '#666' }}>
                  Checked out by: {tool.checked_out_by}
                  {tool.condition === 'Damaged' ? ' — ⚠️ Damaged' : ''}
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