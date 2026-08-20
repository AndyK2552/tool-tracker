import { useState } from 'react';
import { supabase } from './supabaseClient';
import { colors } from './theme';
import PageHeader from './PageHeader';

function Registration({ userId, email, onComplete }) {
  const [name, setName] = useState('');
  const [truckNumber, setTruckNumber] = useState('');
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
        truck_number: truckNumber.trim(),
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
    <div style={{ background: colors.navy, minHeight: '100vh' }}>
      <PageHeader title="KYPD Tool Tracker" />

      <div style={{ padding: '2rem 1.25rem', textAlign: 'center' }}>
        <h2 style={{ color: colors.white, fontSize: '18px', marginBottom: '0.25rem' }}>Welcome!</h2>
        <p style={{ color: colors.textMuted, fontSize: '14px', marginBottom: '1.25rem' }}>
          First time here — what's your full name?
        </p>

        <form onSubmit={handleSubmit} style={{ maxWidth: '320px', margin: '0 auto' }}>
          <input
            type="text"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '0.75rem',
              borderRadius: '6px',
              border: 'none',
              fontSize: '15px',
              marginBottom: '1rem',
            }}
          />
          <input
            type="text"
            placeholder="Truck number"
            value={truckNumber}
            onChange={(e) => setTruckNumber(e.target.value)}
            required
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '0.75rem',
              borderRadius: '6px',
              border: 'none',
              fontSize: '15px',
              marginBottom: '1rem',
            }}
          />
          <button
            type="submit"
            disabled={saving}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '6px',
              border: 'none',
              background: colors.gold,
              color: colors.navy,
              fontWeight: 'bold',
              fontSize: '15px',
              cursor: 'pointer',
            }}
          >
            {saving ? 'Saving...' : 'Continue'}
          </button>
        </form>
        {error && <p style={{ color: '#ff8080', marginTop: '1rem', fontSize: '13px' }}>{error}</p>}
      </div>
    </div>
  );
}

export default Registration;