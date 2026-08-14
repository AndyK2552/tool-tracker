import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

function ToolDetail({ toolId, onHome, onBackToStatus }) {
  const [tool, setTool] = useState(null);
  const [techs, setTechs] = useState([]);
  const [selectedTech, setSelectedTech] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  const fetchTool = async () => {
    const { data } = await supabase.from('tools').select('*').eq('id', toolId).single();
    setTool(data);
    setLoading(false);
  };

  const fetchTechs = async () => {
    const { data } = await supabase.from('profiles').select('name').order('name');
    setTechs(data || []);
  };

  useEffect(() => {
    fetchTool();
    fetchTechs();
  }, [toolId]);

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete "${tool.name}"? This cannot be undone.`)) return;

    const { error } = await supabase.from('tools').delete().eq('id', tool.id);
    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      onBackToStatus();
    }
  };

  const handleReturn = async () => {
    const now = new Date().toISOString();
    const techWhoReturned = tool.checked_out_by;

    const { data, error } = await supabase
      .from('tools')
      .update({ is_checked_out: false, checked_out_by: null, checked_out_at: null })
      .eq('id', tool.id)
      .select()
      .single();

    if (error) {
      setMessage({ type: 'error', text: error.message });
      return;
    }

    await supabase.from('tool_history').insert({
      tool_id: tool.id,
      tool_name: tool.name,
      action: 'returned',
      tech_name: techWhoReturned,
      timestamp: now,
    });

    setTool(data);
    setMessage({ type: 'success', text: 'Tool returned.' });
  };

  const handleCheckOut = async () => {
    if (!selectedTech) {
      setMessage({ type: 'error', text: 'Please select a tech first.' });
      return;
    }

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('tools')
      .update({
        is_checked_out: true,
        checked_out_by: selectedTech,
        checked_out_at: now,
        overdue_alert_sent: false,
      })
      .eq('id', tool.id)
      .select()
      .single();

    if (error) {
      setMessage({ type: 'error', text: error.message });
      return;
    }

    await supabase.from('tool_history').insert({
      tool_name: tool.name,
      tool_id: tool.id,
      action: 'checked_out',
      tech_name: selectedTech,
      timestamp: now,
    });

    setTool(data);
    setMessage({ type: 'success', text: `Checked out to ${selectedTech}.` });
  };

  if (loading) return <p>Loading...</p>;
  if (!tool) return <p>Tool not found.</p>;

  return (
    <div style={{ padding: '1rem' }}>
      <button onClick={onHome} style={{ marginBottom: '1rem' }}>Home</button>

      <h1>{tool.name}</h1>

      <div style={{ padding: '1rem', border: '1px solid #ccc', maxWidth: '400px' }}>
        <p><strong>Serial Number:</strong> {tool.id}</p>
        <p><strong>Checked out:</strong> {tool.is_checked_out ? 'Yes' : 'No'}</p>
        <p><strong>Checked out by:</strong> {tool.checked_out_by || '—'}</p>
        <p><strong>Condition:</strong> {tool.condition}</p>

        {tool.is_checked_out ? (
          <button onClick={handleReturn} style={{ marginTop: '0.5rem' }}>Return</button>
        ) : (
          <div style={{ marginTop: '0.5rem' }}>
            <select
              value={selectedTech}
              onChange={(e) => setSelectedTech(e.target.value)}
              style={{ padding: '0.4rem', marginRight: '0.5rem' }}
            >
              <option value="">Select a tech...</option>
              {techs.map((t) => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
            <button onClick={handleCheckOut}>Check Out</button>
          </div>
        )}

        <div style={{ marginTop: '1rem' }}>
          <button onClick={handleDelete} style={{ color: 'red' }}>Delete Tool</button>
        </div>
      </div>

      {message && (
        <p style={{ color: message.type === 'error' ? 'red' : 'green', marginTop: '1rem' }}>
          {message.text}
        </p>
      )}
    </div>
  );
}

export default ToolDetail;