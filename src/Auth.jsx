import { useState } from 'react';
import { supabase } from './supabaseClient';
import { colors } from './theme';
import PageHeader from './PageHeader';

function Auth() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  };

  return (
    <div style={{ background: colors.navy, minHeight: '100vh' }}>
      <PageHeader title="KYPD Tool Tracker" />

      <div style={{ padding: '2rem 1.25rem', textAlign: 'center' }}>
        {sent ? (
          <>
            <h2 style={{ color: colors.white, fontSize: '18px' }}>Check your email</h2>
            <p style={{ color: colors.textMuted, fontSize: '14px' }}>
              We sent a sign-in link to {email}. Tap it to log in.
            </p>
          </>
        ) : (
          <>
            <p style={{ color: colors.white, fontSize: '15px', marginBottom: '1.25rem' }}>
              Sign in to get started
            </p>
            <form onSubmit={handleSignIn} style={{ maxWidth: '320px', margin: '0 auto' }}>
              <input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                Send Sign-In Link
              </button>
            </form>
            {error && <p style={{ color: '#ff8080', marginTop: '1rem', fontSize: '13px' }}>{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}

export default Auth;