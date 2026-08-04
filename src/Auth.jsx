import { useState } from 'react';
import { supabase } from './supabaseClient';

function Auth() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
    });

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  };

  if (sent) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Check your email</h2>
        <p>We sent a sign-in link to {email}. Tap it to log in.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>Tool Tracker</h1>
      <form onSubmit={handleSignIn}>
        <input
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ padding: '0.5rem', width: '80%', marginBottom: '1rem' }}
        />
        <br />
        <button type="submit">Send Sign-In Link</button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
}

export default Auth;