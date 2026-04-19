import { useState, useEffect } from 'react'
import { call } from './lib/tauri'
import { useSettingsStore } from './store/settingsStore'
import LicenseScreen from './pages/LicenseScreen'
import POS from './pages/POS'
import Setup from './pages/Setup'
import History from './pages/History'
import Recent from './pages/Recent'
import UpdateBanner from './components/UpdateBanner'
import PasswordGate from './components/PasswordGate'

export default function App() {
  const [licenseValid, setLicenseValid] = useState(null)
  const [activeTab, setActiveTab] = useState('pos')
  const [updateAvailable, setUpdateAvailable] = useState(null)
  const [isAdminAuth, setIsAdminAuth] = useState(false)
  const [showPasswordGate, setShowPasswordGate] = useState(false)
  const [pendingTab, setPendingTab] = useState(null)
  const { fetchSettings, hasAdminPin } = useSettingsStore()

  useEffect(() => {
    call('get_license_status')
      .then(status => setLicenseValid(status.valid))
      .catch(() => setLicenseValid(false))
  }, [])

  useEffect(() => {
    if (licenseValid) fetchSettings()
  }, [licenseValid])

  useEffect(() => {
    if (!licenseValid) return
    const timer = setTimeout(async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater')
        const update = await check()
        if (update?.available) setUpdateAvailable(update)
      } catch {}
    }, 5000)
    return () => clearTimeout(timer)
  }, [licenseValid])

  const handleTabClick = (tabId) => {
    const protectedTabs = ['setup', 'history']
    if (protectedTabs.includes(tabId) && !isAdminAuth) {
      setPendingTab(tabId)
      setShowPasswordGate(true)
      return
    }
    setActiveTab(tabId)
  }

  const handleUnlock = () => {
    setIsAdminAuth(true)
    setShowPasswordGate(false)
    if (pendingTab) { setActiveTab(pendingTab); setPendingTab(null) }
  }

  if (licenseValid === null) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: '#fff7ed' }}>
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-orange-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-stone-500 text-sm font-medium">Starting BillEasy…</p>
        </div>
      </div>
    )
  }

  if (!licenseValid) {
    return <LicenseScreen onActivated={() => setLicenseValid(true)} />
  }

  const tabs = [
    { id: 'pos', label: 'Billing', icon: '🧾' },
    { id: 'recent', label: 'Recent', icon: '📊' },
    { id: 'setup', label: 'Setup', icon: '⚙️', locked: !isAdminAuth },
    { id: 'history', label: 'History', icon: '📋', locked: !isAdminAuth },
  ]

  return (
    <div className="flex flex-col h-full" style={{ background: '#fff7ed' }}>
      {updateAvailable && (
        <UpdateBanner update={updateAvailable} onDismiss={() => setUpdateAvailable(null)} />
      )}

      {/* ═══════ Compact Nav ═══════ */}
      <nav className="flex items-center bg-white border-b border-stone-100 px-4 py-0 relative z-10">
        <div className="flex items-center gap-2 mr-6">
          <div className="w-7 h-7 bg-gradient-to-br from-orange-400 to-orange-600 rounded-lg flex items-center justify-center shadow-sm">
            <span className="text-white text-xs font-bold">₹</span>
          </div>
          <span className="font-heading font-bold text-stone-900 text-sm tracking-tight">BillEasy</span>
        </div>

        <div className="flex items-center">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
            >
              <span className="mr-1">{tab.icon}</span>
              {tab.label}
              {tab.locked && <span className="ml-1 text-[10px] opacity-50">🔒</span>}
            </button>
          ))}
        </div>

        {isAdminAuth && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-1 rounded-full">🔓 Admin</span>
            <button onClick={() => setIsAdminAuth(false)} className="text-xs text-stone-400 hover:text-stone-600 font-medium">Lock</button>
          </div>
        )}
      </nav>

      <main className="flex-1 overflow-hidden">
        {activeTab === 'pos' && <POS />}
        {activeTab === 'recent' && <Recent />}
        {activeTab === 'setup' && <Setup />}
        {activeTab === 'history' && <History />}
      </main>

      {showPasswordGate && (
        <PasswordGate
          onUnlock={handleUnlock}
          onCancel={() => { setShowPasswordGate(false); setPendingTab(null) }}
        />
      )}
    </div>
  )
}