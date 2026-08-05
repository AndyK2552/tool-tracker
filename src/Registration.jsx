import { useState } from 'react';
import { supabase } from './supabaseClient';

function Registration({ userId, email, onComplete }) {
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const { error } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        email: email,
        name: name.trim(),
        is_admin: false,
      });

    if (error) {
      setError(error.message);
      setSaving(false);
    } else {
      onComplete();
    }
  };

  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>Welcome!</h1>
      <p>First time here — what's your full name?</p>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          style={{ padding: '0.5rem', width: '80%', marginBottom: '1rem' }}
        />
        <br />
        <button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Continue'}
        </button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
}

export default Registration;