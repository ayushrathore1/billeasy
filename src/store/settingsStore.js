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
}

export const useSettingsStore = create((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  logoDataUri: null, // base64 data URI for preview
  loaded: false,

  fetchSettings: async () => {
    try {
      const settings = await call('get_settings')
      set({ settings, loaded: true })
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
    set({ logoDataUri: uri, settings })
  },

  deleteLogo: async () => {
    await call('delete_logo')
    const settings = await call('get_settings')
    set({ logoDataUri: null, settings })
  },
}))
