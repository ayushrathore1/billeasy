import { create } from 'zustand'
import { call } from '../lib/tauri'

const DEFAULT_SETTINGS = {
  shop_name: 'My Shop',
  shop_address: '',
  bill_footer: 'Thank you! Visit again.',
  printer_name: 'USB001',
  printer_type: 'usb', // usb | bluetooth | network | name
}

export const useSettingsStore = create((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
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
}))
