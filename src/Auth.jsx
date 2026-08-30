import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { getAuthLog, clearAuthLog } from './authDebugLog';
import { colors } from './theme';
import PageHeader from './PageHeader';

function Auth() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [copied, setCopied] = useState(false);
  const [authLog, setAuthLog] = useState(() => getAuthLog());

  // The getSession/onAuthStateChange results this page cares about resolve
  // asynchronously shortly after mount — poll briefly so they show up
  // without needing a manual refresh.
  useEffect(() => {
    const interval = setInterval(() => setAuthLog(getAuthLog()), 1000);
    return () => clearInterval(interval);
  }, []);

  const diagnosticsText = JSON.stringify(authLog, null, 2);

  const handleCopyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(diagnosticsText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable — the text is still visible to select manually
    }
  };

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

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setError(null);
    setVerifying(true);

    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });

    if (error) {
      setError(error.message);
    }
    setVerifying(false);
  };

  return (
    <div style={{ background: colors.navy, minHeight: '100vh' }}>
      <PageHeader title="KYPD Tool Tracker" />

      <div style={{ padding: '2rem 1.25rem', textAlign: 'center' }}>
        {sent ? (
          <>
            <h2 style={{ color: colors.white, fontSize: '18px' }}>Check your email</h2>
            <p style={{ color: colors.textMuted, fontSize: '14px', marginBottom: '1.25rem' }}>
              We sent a sign-in link to {email}. Tap it to log in, or enter the code from that same email below.
            </p>
            <form onSubmit={handleVerifyCode} style={{ maxWidth: '320px', margin: '0 auto' }}>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Enter code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '15px',
                  marginBottom: '1rem',
                  textAlign: 'center',
                  letterSpacing: '0.2em',
                }}
              />
              <button
                type="submit"
                disabled={verifying}
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
                  opacity: verifying ? 0.6 : 1,
                }}
              >
                {verifying ? 'Verifying...' : 'Verify Code'}
              </button>
            </form>
            <p style={{ marginTop: '1rem' }}>
              <button
                type="button"
                onClick={() => { setSent(false); setCode(''); setError(null); }}
                style={{ background: 'none', border: 'none', color: colors.textMuted, fontSize: '0.85rem', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
              >
                Use a different email
              </button>
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
          </>
        )}

        {error && <p style={{ color: '#ff8080', marginTop: '1rem', fontSize: '13px' }}>{error}</p>}

        {authLog.length > 0 && (
          <div style={{ marginTop: '2rem', maxWidth: '320px', marginLeft: 'auto', marginRight: 'auto', textAlign: 'left' }}>
            <button
              type="button"
              onClick={() => setShowDiagnostics((v) => !v)}
              style={{ background: 'none', border: 'none', color: colors.textMuted, fontSize: '0.8rem', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
            >
              {showDiagnostics ? 'Hide' : 'Trouble signing in? View diagnostics'}
            </button>

            {showDiagnostics && (
              <div style={{ marginTop: '0.75rem' }}>
                <pre
                  style={{
                    background: colors.navyLight, border: `0.5px solid ${colors.navyBorder}`, borderRadius: '6px',
                    padding: '0.75rem', color: colors.textMuted, fontSize: '0.7rem', overflowX: 'auto',
                    maxHeight: '300px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}
                >
                  {diagnosticsText}
                </pre>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={handleCopyDiagnostics}
                    style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: 'none', background: colors.navyLight, color: colors.white, fontSize: '0.75rem', cursor: 'pointer' }}
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { clearAuthLog(); setAuthLog([]); setShowDiagnostics(false); }}
                    style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: 'none', background: colors.navyLight, color: colors.white, fontSize: '0.75rem', cursor: 'pointer' }}
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Auth;