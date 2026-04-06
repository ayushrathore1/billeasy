import { useState, useEffect } from 'react'
import { call } from './lib/tauri'
import LicenseScreen from './pages/LicenseScreen'
import POS from './pages/POS'
import Setup from './pages/Setup'
import History from './pages/History'
import UpdateBanner from './components/UpdateBanner'

export default function App() {
  const [licenseValid, setLicenseValid] = useState(null) // null = loading
  const [activeTab, setActiveTab] = useState('pos')
  const [updateAvailable, setUpdateAvailable] = useState(null)

  // Check license on startup
  useEffect(() => {
    call('get_license_status')
      .then(status => setLicenseValid(status.valid))
      .catch(() => setLicenseValid(false))
  }, [])

  // Check for updates 5s after app loads
  useEffect(() => {
    if (!licenseValid) return
    const timer = setTimeout(async () => {
      try {
        // Dynamically import to avoid errors if plugin not configured
        const { check } = await import('@tauri-apps/plugin-updater')
        const update = await check()
        if (update?.available) setUpdateAvailable(update)
      } catch {
        // Silently ignore — no internet or updater not configured
      }
    }, 5000)
    return () => clearTimeout(timer)
  }, [licenseValid])

  // Loading
  if (licenseValid === null) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Starting BillEasy…</p>
        </div>
      </div>
    )
  }

  // License gate
  if (!licenseValid) {
    return <LicenseScreen onActivated={() => setLicenseValid(true)} />
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {updateAvailable && (
        <UpdateBanner
          update={updateAvailable}
          onDismiss={() => setUpdateAvailable(null)}
        />
      )}

      {/* Top navigation */}
      <nav className="flex items-center bg-white border-b border-gray-200 px-4 py-0 shadow-sm">
        <div className="flex items-center gap-2 mr-6">
          <div className="w-7 h-7 bg-brand-500 rounded-md flex items-center justify-center">
            <span className="text-white text-xs font-bold">₹</span>
          </div>
          <span className="font-bold text-gray-800 text-sm">BillEasy</span>
        </div>
        {[
          { id: 'pos', label: '🧾 Billing' },
          { id: 'setup', label: '⚙️ Setup' },
          { id: 'history', label: '📋 History' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Page content */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'pos' && <POS />}
        {activeTab === 'setup' && <Setup />}
        {activeTab === 'history' && <History />}
      </main>
    </div>
  )
}
