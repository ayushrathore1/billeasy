import { create } from 'zustand'
import { call } from '../lib/tauri'

const DEFAULT_SETTINGS = {
  shop_name: 'My Shop',
  shop_tagline: '',
  shop_address: '',
  shop_phone: '',
  bill_footer: 'Thank you for being our customer ❤️',
  printer_name: 'USB001',
  printer_type: 'usb', // usb | bluetooth | network | name
  logo_enabled: false,
  has_cutter: true,
  gst_percent: 0,
  payment_mode: '',
  cloudinary_cloud_name: '',
  cloudinary_upload_preset: '',
  admin_pin_hash: '',
}

export const useSettingsStore = create((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  logoDataUri: null, // base64 data URI for preview
  loaded: false,

  fetchSettings: async () => {
    try {
      const settings = await call('get_settings')
      set({ settings: { ...DEFAULT_SETTINGS, ...settings }, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  saveSettings: async (updates) => {
    const next = { ...get().settings, ...updates }
    await call('save_settings', { settings: next })
    set({ settings: next })
  },

  fetchLogo: async () => {
    try {
      const uri = await call('get_logo')
      set({ logoDataUri: uri })
    } catch {
      set({ logoDataUri: null })
    }
  },

  saveLogo: async (base64Data) => {
    await call('save_logo', { base64Data })
    // Refresh logo and settings
    const uri = await call('get_logo')
    const settings = await call('get_settings')
    set({ logoDataUri: uri, settings: { ...DEFAULT_SETTINGS, ...settings } })
  },

  deleteLogo: async () => {
    await call('delete_logo')
    const settings = await call('get_settings')
    set({ logoDataUri: null, settings: { ...DEFAULT_SETTINGS, ...settings } })
  },

  // ── Admin PIN Methods ──

  hasAdminPin: () => {
    return !!get().settings.admin_pin_hash
  },

  setAdminPin: async (pin) => {
    // Simple hash using SubtleCrypto
    const hash = await hashPin(pin)
    await get().saveSettings({ admin_pin_hash: hash })
  },

  checkAdminPin: async (pin) => {
    const storedHash = get().settings.admin_pin_hash
    if (!storedHash) return true // No PIN set = always passes
    const hash = await hashPin(pin)
    return hash === storedHash
  },

  removeAdminPin: async () => {
    await get().saveSettings({ admin_pin_hash: '' })
  },
}))

/**
 * Hash a PIN string using SHA-256 via SubtleCrypto.
 */
async function hashPin(pin) {
  const encoder = new TextEncoder()
  const data = encoder.encode(pin + '_billeasy_salt')
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
