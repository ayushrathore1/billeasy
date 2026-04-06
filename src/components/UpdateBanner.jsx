import { useState } from 'react'

export default function UpdateBanner({ update, onDismiss }) {
  const [installing, setInstalling] = useState(false)

  const handleInstall = async () => {
    setInstalling(true)
    try {
      await update.downloadAndInstall()
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    } catch (e) {
      console.error('Update failed:', e)
      setInstalling(false)
    }
  }

  return (
    <div className="bg-brand-600 text-white px-4 py-2 flex items-center gap-4 text-sm">
      <span className="flex-1">
        🔔 New version <strong>{update.version}</strong> is available!
      </span>
      <button
        onClick={handleInstall}
        disabled={installing}
        className="bg-white text-brand-700 font-semibold px-3 py-1 rounded-md hover:bg-brand-50 transition-colors disabled:opacity-60"
      >
        {installing ? 'Installing…' : 'Restart & Update'}
      </button>
      <button
        onClick={onDismiss}
        className="text-brand-200 hover:text-white transition-colors"
        title="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}
