import { useState } from 'react'
import { call } from '../lib/tauri'

export default function LicenseScreen({ onActivated }) {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const formatKey = (val) => {
    // Strip non-alphanumeric, uppercase, then insert dashes at BILL-XXXX-XXXX-XXXX
    const raw = val.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 16)
    const parts = raw.match(/.{1,4}/g) || []
    return parts.join('-')
  }

  const handleChange = (e) => {
    setKey(formatKey(e.target.value))
    setError('')
  }

  const handleActivate = async () => {
    const stripped = key.replace(/-/g, '')
    if (stripped.length < 12) {
      setError('Please enter a valid license key.')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Get machine ID first
      const machineId = await call('get_machine_id')
      const status = await call('validate_license', { key, machineId })

      if (status.valid) {
        onActivated()
      } else {
        setError(status.message ?? 'License validation failed.')
      }
    } catch (e) {
      setError(typeof e === 'string' ? e : 'Could not connect to license server. Check your internet connection.')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleActivate()
  }

  return (
    <div className="flex items-center justify-center h-full bg-gradient-to-br from-brand-50 to-orange-100">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-brand-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white text-3xl font-bold">₹</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">BillEasy</h1>
          <p className="text-gray-500 text-sm mt-1">Desktop Billing for Windows</p>
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Activate License</h2>
          <p className="text-sm text-gray-500">
            Enter the license key provided to you. This is a one-time activation.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              License Key
            </label>
            <input
              type="text"
              value={key}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="BILL-XXXX-XXXX-XXXX"
              maxLength={19}
              autoFocus
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center text-lg font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <button
            onClick={handleActivate}
            disabled={loading}
            className="w-full bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Validating… (may take up to 30s on first try)
              </>
            ) : (
              'Activate'
            )}
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Need a license key? Contact your BillEasy distributor.
        </p>
      </div>
    </div>
  )
}
