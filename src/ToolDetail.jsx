import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { colors } from './theme';
import PageHeader from './PageHeader';

function ToolDetail({ toolId, isAdmin, techProfile, onHome, onBackToStatus }) {
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
    if (!isAdmin) return;
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
      tool_id: tool.id, tool_name: tool.name, action: 'returned', tech_name: techWhoReturned, timestamp: now,
    });

    setTool(data);
    setMessage({ type: 'success', text: 'Tool returned.' });
  };

  const handleCheckOut = async (techName) => {
    if (!techName) {
      setMessage({ type: 'error', text: 'Please select a tech first.' });
      return;
    }

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('tools')
      .update({ is_checked_out: true, checked_out_by: techName, checked_out_at: now, overdue_alert_sent: false })
      .eq('id', tool.id)
      .select()
      .single();

    if (error) {
      setMessage({ type: 'error', text: error.message });
      return;
    }

    await supabase.from('tool_history').insert({
      tool_name: tool.name, tool_id: tool.id, action: 'checked_out', tech_name: techName, timestamp: now,
    });

    setTool(data);
    setMessage({ type: 'success', text: `Checked out to ${techName}.` });
  };

  const btnStyle = {
    padding: '0.6rem 1rem',
    borderRadius: '6px',
    border: 'none',
    background: colors.gold,
    color: colors.navy,
    fontWeight: 'bold',
    cursor: 'pointer',
    marginTop: '0.5rem',
  };

  const secondaryBtnStyle = {
    ...btnStyle,
    background: colors.navyLight,
    color: colors.white,
    border: `0.5px solid ${colors.navyBorder}`,
  };

  if (loading) return <p style={{ color: colors.white, padding: '1rem' }}>Loading...</p>;
  if (!tool) return <p style={{ color: colors.white, padding: '1rem' }}>Tool not found.</p>;

  const canReturn = isAdmin || tool.checked_out_by === techProfile?.name;

  return (
    <div style={{ background: colors.navy, minHeight: '100vh' }}>
      <PageHeader title="KYPD Tool Tracker" />

      <div style={{ padding: '1.25rem' }}>
        <button onClick={isAdmin ? onHome : onBackToStatus} style={{ ...btnStyle, marginBottom: '1rem' }}>
          {isAdmin ? 'Home' : 'Back to Tool Status'}
        </button>

        <h1 style={{ color: colors.white, fontSize: '20px' }}>{tool.name}</h1>

        <div style={{ background: colors.navyLight, border: `0.5px solid ${colors.navyBorder}`, borderRadius: '8px', padding: '1rem', maxWidth: '400px' }}>
          <p style={{ color: colors.textMuted }}><strong style={{ color: colors.white }}>Serial Number:</strong> {tool.id}</p>
          <p style={{ color: colors.textMuted }}><strong style={{ color: colors.white }}>Checked out:</strong> {tool.is_checked_out ? 'Yes' : 'No'}</p>
          <p style={{ color: colors.textMuted }}><strong style={{ color: colors.white }}>Checked out by:</strong> {tool.checked_out_by || '—'}</p>
          <p style={{ color: colors.textMuted }}><strong style={{ color: colors.white }}>Condition:</strong> {tool.condition}</p>

          {tool.is_checked_out ? (
            canReturn ? (
              <button onClick={handleReturn} style={btnStyle}>Return</button>
            ) : (
              <button disabled title={`Only ${tool.checked_out_by} or an admin can return this tool`} style={{ ...btnStyle, opacity: 0.5 }}>
                Return
              </button>
            )
          ) : isAdmin ? (
            <div style={{ marginTop: '0.5rem' }}>
              <select
                value={selectedTech}
                onChange={(e) => setSelectedTech(e.target.value)}
                style={{ padding: '0.5rem', marginRight: '0.5rem', borderRadius: '6px', border: 'none' }}
              >
                <option value="">Select a tech...</option>
                {techs.map((t) => (
                  <option key={t.name} value={t.name}>{t.name}</option>
                ))}
              </select>
              <button onClick={() => handleCheckOut(selectedTech)} style={{ ...btnStyle, marginTop: 0 }}>Check Out</button>
            </div>
          ) : (
            <button onClick={() => handleCheckOut(techProfile.name)} style={btnStyle}>Check Out</button>
          )}

          {isAdmin && (
            <div style={{ marginTop: '1rem' }}>
              <button onClick={handleDelete} style={{ ...secondaryBtnStyle, color: '#ff8080', marginTop: 0 }}>
                Delete Tool
              </button>
            </div>
          )}
        </div>

        {message && (
          <p style={{ color: message.type === 'error' ? '#ff8080' : '#5FCF7A', marginTop: '1rem' }}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}

export default ToolDetail;