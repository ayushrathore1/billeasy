import { create } from 'zustand'
import { call } from '../lib/tauri'

/**
 * Cloudinary unsigned upload store.
 * Config (cloud_name, upload_preset) persisted via app settings.
 */
export const useCloudinaryStore = create((set, get) => ({
  cloudName: '',
  uploadPreset: '',
  uploading: false,
  loaded: false,

  fetchConfig: async () => {
    try {
      const settings = await call('get_settings')
      set({
        cloudName: settings.cloudinary_cloud_name || '',
        uploadPreset: settings.cloudinary_upload_preset || '',
        loaded: true,
      })
    } catch {
      set({ loaded: true })
    }
  },

  saveConfig: async (cloudName, uploadPreset) => {
    const { invoke } = window.__TAURI__?.core || {}
    if (!invoke) return
    // Save as individual settings keys
    const settings = await call('get_settings')
    await call('save_settings', {
      settings: {
        ...settings,
        cloudinary_cloud_name: cloudName,
        cloudinary_upload_preset: uploadPreset,
      }
    })
    set({ cloudName, uploadPreset })
  },

  /**
   * Upload a File object to Cloudinary via unsigned upload.
   * Returns the secure_url on success.
   */
  uploadImage: async (file) => {
    const { cloudName, uploadPreset } = get()
    if (!cloudName || !uploadPreset) {
      throw 'Cloudinary not configured — add Cloud Name & Upload Preset in Setup'
    }

    set({ uploading: true })
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('upload_preset', uploadPreset)
      formData.append('folder', 'billeasy-products')

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        { method: 'POST', body: formData }
      )

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw errData.error?.message || `Upload failed (${response.status})`
      }

      const data = await response.json()
      return data.secure_url
    } finally {
      set({ uploading: false })
    }
  },

  /**
   * Get optimised thumbnail URL from a Cloudinary URL.
   */
  getThumbnail: (url, width = 200, height = 200) => {
    if (!url || !url.includes('cloudinary.com')) return url
    // Insert transformation before /upload/ path
    return url.replace('/upload/', `/upload/w_${width},h_${height},c_fill,f_auto,q_auto/`)
  },
}))
