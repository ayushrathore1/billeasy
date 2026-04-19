import { useState, useEffect, useRef, useCallback } from 'react'
import { useSettingsStore } from '../store/settingsStore'

/**
 * PasswordGate — 4-digit PIN modal with full physical keyboard support.
 * Keys: 0-9 to enter, Backspace to delete, Escape to cancel.
 */
export default function PasswordGate({ onUnlock, onCancel }) {
  const hasAdminPin = useSettingsStore(s => s.hasAdminPin)
  const checkAdminPin = useSettingsStore(s => s.checkAdminPin)
  const setAdminPin = useSettingsStore(s => s.setAdminPin)

  const isFirstTime = !hasAdminPin()
  const [mode, setMode] = useState(isFirstTime ? 'setup' : 'verify')
  const [pin, setPin] = useState('')
  const [setupPin, setSetupPin] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)

  // Use refs to avoid stale closures in keyboard handler
  const pinRef = useRef(pin)
  const modeRef = useRef(mode)
  const setupPinRef = useRef(setupPin)
  pinRef.current = pin
  modeRef.current = mode
  setupPinRef.current = setupPin

  const title = mode === 'setup' ? 'Set Admin PIN'
    : mode === 'confirm' ? 'Confirm PIN'
    : 'Enter Admin PIN'

  const subtitle = mode === 'setup' ? 'Choose a 4-digit PIN'
    : mode === 'confirm' ? 'Re-enter to confirm'
    : 'Enter your PIN to continue'

  const triggerError = useCallback((msg) => {
    setError(msg)
    setShake(true)
    setPin('')
    setTimeout(() => setShake(false), 400)
  }, [])

  const handleSubmit = useCallback(async (fullPin) => {
    const currentMode = modeRef.current
    const currentSetupPin = setupPinRef.current

    if (currentMode === 'setup') {
      setSetupPin(fullPin)
      setPin('')
      setMode('confirm')
    } else if (currentMode === 'confirm') {
      if (fullPin === currentSetupPin) {
        await setAdminPin(fullPin)
        onUnlock?.()
      } else {
        triggerError('PINs did not match')
        setMode('setup')
        setSetupPin('')
      }
    } else {
      const valid = await checkAdminPin(fullPin)
      if (valid) {
        onUnlock?.()
      } else {
        triggerError('Incorrect PIN')
      }
    }
  }, [checkAdminPin, setAdminPin, onUnlock, triggerError])

  const handleDigit = useCallback((digit) => {
    const currentPin = pinRef.current
    if (currentPin.length >= 4) return
    const next = currentPin + digit
    setPin(next)
    setError('')
    if (next.length === 4) {
      setTimeout(() => handleSubmit(next), 150)
    }
  }, [handleSubmit])

  const handleBackspace = useCallback(() => {
    setPin(p => p.slice(0, -1))
    setError('')
  }, [])

  // Physical keyboard listener
  useEffect(() => {
    const handler = (e) => {
      // Prevent default to avoid typing in background inputs
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault()
        handleDigit(e.key)
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        handleBackspace()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onCancel?.()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleDigit, handleBackspace, onCancel])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(16px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel?.() }}
    >
      <div className={`bg-white rounded-3xl shadow-2xl w-[320px] overflow-hidden animate-scale-up ${shake ? 'animate-shake' : ''}`}>
        {/* Header */}
        <div className="pt-7 pb-3 px-8 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-lg">
            <span className="text-white text-xl">🔒</span>
          </div>
          <h2 className="font-heading text-lg font-bold text-stone-900">{title}</h2>
          <p className="text-sm text-stone-400 mt-0.5">{subtitle}</p>
        </div>

        {/* PIN dots */}
        <div className="flex justify-center gap-4 py-3">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={`pin-dot ${i < pin.length ? 'filled' : ''}`} />
          ))}
        </div>

        {/* Error */}
        <div className="h-5 text-center">
          {error && <span className="text-red-500 text-xs font-medium">{error}</span>}
        </div>

        {/* Keypad */}
        <div className="px-10 pb-5">
          <div className="grid grid-cols-3 gap-2.5 justify-items-center">
            {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((key, i) => (
              key === '' ? <div key={i} /> :
              <button
                key={i}
                onClick={() => key === '⌫' ? handleBackspace() : handleDigit(key)}
                className={`keypad-btn ${key === '⌫' ? 'text-lg' : ''}`}
                tabIndex={-1}
              >
                {key}
              </button>
            ))}
          </div>
        </div>

        {/* Keyboard hint */}
        <div className="text-center pb-3">
          <span className="text-[10px] text-stone-300">Use keyboard 0-9 · Backspace · Esc</span>
        </div>

        {/* Cancel */}
        <div className="border-t border-stone-100 px-8 py-3">
          <button
            onClick={onCancel}
            className="w-full text-center text-sm text-stone-400 hover:text-stone-600 font-medium py-2 rounded-xl hover:bg-stone-50 transition-colors"
            tabIndex={-1}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
