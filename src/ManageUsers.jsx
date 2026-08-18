import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import PageHeader from './PageHeader';
import { colors, btnStyle, secondaryBtnStyle } from './theme';

function ManageUsers({ onHome }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editIsAdmin, setEditIsAdmin] = useState(false);
  const [message, setMessage] = useState(null);

  const fetchUsers = async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('name');
    if (!error && data) setUsers(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const startEdit = (user) => {
    setEditingId(user.id);
    setEditName(user.name || '');
    setEditEmail(user.email || '');
    setEditIsAdmin(!!user.is_admin);
    setMessage(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .update({ name: editName.trim(), email: editEmail.trim(), is_admin: editIsAdmin })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      setMessage({ type: 'error', text: error.message });
      return;
    }

    setUsers((prev) => prev.map((u) => (u.id === userId ? data : u)));
    setEditingId(null);
    setMessage({ type: 'success', text: 'User updated.' });
  };

  const cardStyle = { background: colors.navyLight, border: `0.5px solid ${colors.navyBorder}`, borderRadius: '8px', padding: '1rem', marginBottom: '0.75rem' };
  const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '0.5rem', borderRadius: '6px', border: 'none', marginBottom: '0.5rem' };
  const labelStyle = { display: 'block', color: colors.white, fontSize: '13px', marginBottom: '0.25rem' };

  if (loading) return <p style={{ color: colors.white, padding: '1rem' }}>Loading...</p>;

  return (
    <div style={{ background: colors.navy, minHeight: '100vh' }}>
      <PageHeader title="KYPD Tool Tracker" />

      <div style={{ padding: '1.25rem' }}>
        <button onClick={onHome} style={{ ...btnStyle, marginBottom: '1rem' }}>Home</button>

        <h1 style={{ color: colors.white, fontSize: '20px' }}>Manage Users</h1>

        {message && (
          <p style={{ color: message.type === 'error' ? '#ff8080' : '#5FCF7A', marginBottom: '1rem' }}>
            {message.text}
          </p>
        )}

        <div style={{ maxWidth: '450px' }}>
          {users.map((user) => (
            <div key={user.id} style={cardStyle}>
              {editingId === user.id ? (
                <>
                  <label style={labelStyle}>Name</label>
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} style={inputStyle} />

                  <label style={labelStyle}>Email</label>
                  <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} style={inputStyle} />

                  <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
                    <input type="checkbox" checked={editIsAdmin} onChange={(e) => setEditIsAdmin(e.target.checked)} />
                    Admin
                  </label>

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button onClick={() => saveEdit(user.id)} style={btnStyle}>Save</button>
                    <button onClick={cancelEdit} style={secondaryBtnStyle}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ color: colors.white, fontWeight: 'bold', margin: '0 0 4px' }}>{user.name}</p>
                  <p style={{ color: colors.textMuted, fontSize: '0.85rem', margin: '0 0 4px' }}>{user.email}</p>
                  <p style={{ color: colors.textMuted, fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
                    {user.is_admin ? 'Admin' : 'Tech'}
                  </p>
                  <button onClick={() => startEdit(user)} style={secondaryBtnStyle}>Edit</button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ManageUsers;
