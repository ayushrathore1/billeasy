/**
 * Typed wrapper around Tauri's invoke() with unified error handling.
 * Uses window.__TAURI__ global (enabled via withGlobalTauri in tauri.conf.json).
 */
export async function call(command, args = {}) {
  try {
    // withGlobalTauri: true exposes this global in the webview
    const invoke = window.__TAURI__?.core?.invoke
    if (!invoke) {
      throw new Error('Tauri API not available — make sure the app is running inside Tauri')
    }
    return await invoke(command, args)
  } catch (err) {
    throw typeof err === 'string' ? err : (err?.message ?? 'Unknown error')
  }
}
