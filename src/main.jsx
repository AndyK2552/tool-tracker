import { createRoot } from 'react-dom/client'
import './index.css'
import QrTest from './QrTest.jsx'
import Auth from './Auth.jsx'
import Registration from './Registration.jsx'
import ToolStatus from './ToolStatus.jsx'
import AdminPage from './AdminPage.jsx'
import { supabase } from './supabaseClient.js'
import { StrictMode, Component, useState, useEffect, useRef } from 'react'
import AdminHome from './AdminHome.jsx'
import CheckoutHistory from './CheckoutHistory.jsx'
import ToolDetail from './ToolDetail.jsx'
import ManageUsers from './ManageUsers.jsx'
import UserDetail from './UserDetail.jsx'
import { colors } from './theme'
import { installGlobalCrashLogging, getLastCrash, clearLastCrash, logCrash } from './crashLog.js'
import { useRegisterSW } from 'virtual:pwa-register/react'

installGlobalCrashLogging()

class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    logCrash('react-error-boundary', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ background: colors.navy, minHeight: '100vh', padding: '1.25rem', color: colors.white }}>
          <h2>Something went wrong</h2>
          <p style={{ color: '#ff8080' }}>{this.state.error.message}</p>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.7rem', color: colors.textMuted }}>{this.state.error.stack}</pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: '1rem', padding: '0.6rem 1rem', borderRadius: '6px', border: 'none', background: colors.gold, color: colors.navy, fontWeight: 'bold', cursor: 'pointer' }}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function CrashBanner() {
  const [crash, setCrash] = useState(() => getLastCrash())

  if (!crash) return null

  return (
    <div style={{ background: '#3a1414', color: '#ff8080', padding: '0.85rem 1.25rem', fontSize: '0.8rem' }}>
      <strong>Last crash ({crash.source}, {new Date(crash.time).toLocaleString()}):</strong>
      <p style={{ margin: '0.35rem 0', whiteSpace: 'pre-wrap' }}>{crash.message}</p>
      {crash.stack && <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.65rem', opacity: 0.8 }}>{crash.stack}</pre>}
      <button
        onClick={() => { clearLastCrash(); setCrash(null) }}
        style={{ marginTop: '0.5rem', padding: '0.3rem 0.75rem', borderRadius: '6px', border: 'none', background: colors.navyLight, color: colors.white, cursor: 'pointer' }}
      >
        Dismiss
      </button>
    </div>
  )
}

function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div style={{ background: colors.gold, color: colors.navy, padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
      <strong>A new version is available.</strong>
      <button
        onClick={() => updateServiceWorker()}
        style={{ padding: '0.4rem 0.9rem', borderRadius: '6px', border: 'none', background: colors.navy, color: colors.white, fontWeight: 'bold', cursor: 'pointer' }}
      >
        Update Now
      </button>
    </div>
  )
}

function Root() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState(() => localStorage.getItem('view') || 'scanner')
  const [selectedToolId, setSelectedToolId] = useState(() => localStorage.getItem('selectedToolId') || null)
  const [selectedUserId, setSelectedUserId] = useState(() => localStorage.getItem('selectedUserId') || null)
  const hasSetInitialView = useRef(localStorage.getItem('view') !== null)
  const isPopStateRef = useRef(false)
  const hasInitializedHistoryRef = useRef(false)

  useEffect(() => {
    if (isPopStateRef.current) {
      isPopStateRef.current = false
      return
    }
    if (!hasInitializedHistoryRef.current) {
      hasInitializedHistoryRef.current = true
      window.history.replaceState({ view, selectedToolId, selectedUserId }, '')
      return
    }
    window.history.pushState({ view, selectedToolId, selectedUserId }, '')
  }, [view, selectedToolId, selectedUserId])

  useEffect(() => {
    const handlePopState = (event) => {
      isPopStateRef.current = true
      setView(event.state?.view || 'scanner')
      setSelectedToolId(event.state?.selectedToolId || null)
      setSelectedUserId(event.state?.selectedUserId || null)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const loadProfile = async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    setProfile(data || null)

    if (data?.is_admin && !hasSetInitialView.current) {
      setView('home')
      hasSetInitialView.current = true
    }
  }

  const hadSessionRef = useRef(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      hadSessionRef.current = !!session
      if (session) {
        await loadProfile(session.user.id)
      }
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session)

      // Supabase re-fires SIGNED_IN when revalidating an existing session on
      // tab refocus (e.g. returning from the native camera app) — not just on
      // a genuine new login. Only reset navigation on a real sign-in, i.e. a
      // transition from no session to having one; otherwise this was wiping
      // the current view (and in-progress work) back to Home on every refocus.
      const isGenuineSignIn = event === 'SIGNED_IN' && !hadSessionRef.current
      if (isGenuineSignIn || event === 'SIGNED_OUT') {
        setView('scanner')
        hasSetInitialView.current = false
        localStorage.removeItem('view')
        localStorage.removeItem('selectedToolId')
      }

      hadSessionRef.current = !!session

      if (session) {
        await loadProfile(session.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    localStorage.setItem('view', view)
  }, [view])

  useEffect(() => {
    if (selectedToolId) {
      localStorage.setItem('selectedToolId', selectedToolId)
    }
  }, [selectedToolId])

  useEffect(() => {
    if (selectedUserId) {
      localStorage.setItem('selectedUserId', selectedUserId)
    }
  }, [selectedUserId])

  if (loading) return (
    <div style={{ background: colors.navy, minHeight: '100vh', padding: '1.25rem' }}>
      <p style={{ color: colors.white }}>Loading...</p>
    </div>
  )

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

  if (view === 'home') {
    return <AdminHome onNavigate={(v) => setView(v)} techName={profile.name} truckNumber={profile.truck_number} />
  }

  const selectTool = (id) => {
    setSelectedToolId(id)
    setView('toolDetail')
  }

  if (view === 'status') {
    return (
      <ToolStatus
        onHome={() => setView(profile.is_admin ? 'home' : 'scanner')}
        onSelectTool={selectTool}
        isAdmin={profile.is_admin}
        techName={profile.name}
      />
    )
  }

  if (view === 'toolDetail') {
    return (
      <ToolDetail
        toolId={selectedToolId}
        isAdmin={profile.is_admin}
        techProfile={profile}
        onHome={() => setView('home')}
        onBackToStatus={() => setView('status')}
        onSelectTool={selectTool}
      />
    )
  }

  if (view === 'history') {
    return <CheckoutHistory onHome={() => setView('home')} />
  }

  if (view === 'admin') {
    return <AdminPage onHome={() => setView('home')} onSelectTool={selectTool} />
  }

  const selectUser = (id) => {
    setSelectedUserId(id)
    setView('userDetail')
  }

  if (view === 'users') {
    return <ManageUsers onHome={() => setView('home')} onSelectUser={selectUser} />
  }

  if (view === 'userDetail') {
    return (
      <UserDetail
        userId={selectedUserId}
        onHome={() => setView('home')}
        onBackToUsers={() => setView('users')}
        onSelectTool={selectTool}
      />
    )
  }

  return (
    <div>
      <div style={{ padding: '1rem', background: colors.navy, textAlign: 'center' }}>
        {profile.is_admin ? (
          <button
            onClick={() => setView('home')}
            style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: colors.gold, color: colors.navy, fontWeight: 'bold', cursor: 'pointer' }}
          >
            Home
          </button>
        ) : (
          <button
            onClick={() => setView('status')}
            style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: colors.gold, color: colors.navy, fontWeight: 'bold', cursor: 'pointer' }}
          >
            View Tools
          </button>
        )}
      </div>
      <QrTest techProfile={profile} />
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <UpdateBanner />
      <CrashBanner />
      <Root />
    </ErrorBoundary>
  </StrictMode>,
)