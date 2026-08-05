import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import QrTest from './QrTest.jsx'
import Auth from './Auth.jsx'
import Registration from './Registration.jsx'
import ToolStatus from './ToolStatus.jsx'
import AdminPage from './AdminPage.jsx'
import { supabase } from './supabaseClient.js'

function Root() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('scanner')

  const loadProfile = async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    setProfile(data || null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      if (session) {
        await loadProfile(session.user.id)
      }
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session)
      if (session) {
        await loadProfile(session.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  if (loading) return <p>Loading...</p>

  if (!session) return <Auth />

  if (!profile) {
    return (
      <Registration
        userId={session.user.id}
        email={session.user.email}
        onComplete={() => loadProfile(session.user.id)}
      />
    )
  }

  if (view === 'status') {
    return <ToolStatus onBack={() => setView('scanner')} />
  }

  if (view === 'admin') {
    return <AdminPage onBack={() => setView('scanner')} />
  }

  return (
    <div>
      <div style={{ padding: '1rem', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
        <button onClick={() => setView('status')}>View Tool Status</button>
        {profile.is_admin && (
          <button onClick={() => setView('admin')}>Admin</button>
        )}
      </div>
      <QrTest techProfile={profile} />
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)