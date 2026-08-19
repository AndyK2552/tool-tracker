import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import PageHeader from './PageHeader';
import { colors, btnStyle } from './theme';

function ManageUsers({ onHome, onSelectUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('name');
    if (!error && data) setUsers(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const cardStyle = {
    background: colors.navyLight,
    border: `0.5px solid ${colors.navyBorder}`,
    borderRadius: '8px',
    padding: '0.75rem',
    marginBottom: '0.5rem',
    cursor: 'pointer',
  };

  if (loading) return (
    <div style={{ background: colors.navy, minHeight: '100vh', padding: '1.25rem' }}>
      <p style={{ color: colors.white }}>Loading...</p>
    </div>
  );

  return (
    <div style={{ background: colors.navy, minHeight: '100vh' }}>
      <PageHeader title="KYPD Tool Tracker" />

      <div style={{ padding: '1.25rem' }}>
        <button onClick={onHome} style={{ ...btnStyle, marginBottom: '1rem' }}>Home</button>

        <h1 style={{ color: colors.white, fontSize: '20px' }}>Manage Users</h1>

        <div style={{ maxWidth: '450px' }}>
          {users.map((user) => (
            <div key={user.id} onClick={() => onSelectUser(user.id)} style={cardStyle}>
              <p style={{ color: colors.white, fontWeight: 'bold', margin: '0 0 4px' }}>{user.name}</p>
              <p style={{ color: colors.textMuted, fontSize: '0.85rem', margin: '0 0 4px' }}>{user.email}</p>
              <p style={{ color: colors.textMuted, fontSize: '0.85rem', margin: 0 }}>
                {user.is_admin ? 'Admin' : 'Tech'}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ManageUsers;
