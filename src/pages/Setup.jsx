import { useEffect, useState, useRef } from 'react'
import { useMenuStore } from '../store/menuStore'
import { useSettingsStore } from '../store/settingsStore'
import { useCloudinaryStore } from '../store/cloudinaryStore'
import { call } from '../lib/tauri'

export default function Setup() {
  const {
    categories, items, selectedCategoryId,
    fetchCategories, fetchItems,
    createCategory, updateCategory, deleteCategory,
    createItem, updateItem, updateItemImage, deleteItem,
  } = useMenuStore()
  const { settings, fetchSettings, saveSettings, logoDataUri, fetchLogo, saveLogo, deleteLogo } = useSettingsStore()
  const { cloudName, uploadPreset, fetchConfig: fetchCloudinary, saveConfig: saveCloudinary, uploadImage, uploading: cloudUploading, getThumbnail } = useCloudinaryStore()

  const [showAddCat, setShowAddCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [editingCatId, setEditingCatId] = useState(null)
  const [editingCatName, setEditingCatName] = useState('')
  const [newItemName, setNewItemName] = useState('')
  const [newItemPrice, setNewItemPrice] = useState('')
  const [editingItemId, setEditingItemId] = useState(null)
  const [editingItemPrice, setEditingItemPrice] = useState('')
  const [testPrinting, setTestPrinting] = useState(false)
  const [toast, setToast] = useState(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [detectedPrinters, setDetectedPrinters] = useState([])
  const [loadingPrinters, setLoadingPrinters] = useState(false)
  const [uploadingItemImage, setUploadingItemImage] = useState(null)
  const [localCloudName, setLocalCloudName] = useState('')
  const [localUploadPreset, setLocalUploadPreset] = useState('')
  const fileInputRef = useRef(null)
  const itemImageRef = useRef(null)

  useEffect(() => {
    fetchCategories()
    fetchSettings()
    fetchLogo()
    fetchCloudinary()
    detectPrinters()
  }, [])

  useEffect(() => {
    setLocalCloudName(cloudName)
    setLocalUploadPreset(uploadPreset)
  }, [cloudName, uploadPreset])

  const detectPrinters = async () => {
    setLoadingPrinters(true)
    try {
      const printers = await call('list_printers')
      setDetectedPrinters(printers || [])
    } catch (e) {
      console.warn('Printer detection failed:', e)
      setDetectedPrinters([])
    } finally {
      setLoadingPrinters(false)
    }
  }

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Category handlers ──
  const handleAddCategory = async () => {
    if (!newCatName.trim()) return
    try {
      await createCategory(newCatName.trim())
      setNewCatName('')
      setShowAddCat(false)
      showToast('Category created')
    } catch (e) { showToast(e, 'error') }
  }

  const handleRenameCategory = async (cat) => {
    if (!editingCatName.trim()) return
    try {
      await updateCategory(cat.id, editingCatName.trim(), cat.is_active, cat.sort_order)
      setEditingCatId(null)
      showToast('Category renamed')
    } catch (e) { showToast(e, 'error') }
  }

  const handleToggleCategory = async (cat) => {
    try {
      await updateCategory(cat.id, cat.name, !cat.is_active, cat.sort_order)
    } catch (e) { showToast(e, 'error') }
  }

  const handleDeleteCategory = async (id) => {
    if (!confirm('Delete this category? All its items will also be hidden.')) return
    try {
      await deleteCategory(id)
      showToast('Category deleted')
    } catch (e) { showToast(e, 'error') }
  }

  // ── Item handlers ──
  const handleAddItem = async () => {
    if (!newItemName.trim() || !newItemPrice) return
    const price = parseFloat(newItemPrice)
    if (isNaN(price) || price < 0) { showToast('Invalid price', 'error'); return }
    try {
      await createItem(selectedCategoryId, newItemName.trim(), price)
      setNewItemName('')
      setNewItemPrice('')
      showToast('Item added')
    } catch (e) { showToast(e, 'error') }
  }

  const handleEditItemPrice = async (item) => {
    const price = parseFloat(editingItemPrice)
    if (isNaN(price) || price < 0) return
    try {
      await updateItem(item.id, item.name, price, item.is_active)
      setEditingItemId(null)
      showToast('Price updated')
    } catch (e) { showToast(e, 'error') }
  }

  const handleToggleItem = async (item) => {
    try { await updateItem(item.id, item.name, item.price, !item.is_active) }
    catch (e) { showToast(e, 'error') }
  }

  const handleDeleteItem = async (id) => {
    try {
      await deleteItem(id)
      showToast('Item removed')
    } catch (e) { showToast(e, 'error') }
  }

  const handleSeedMenu = async () => {
    if (!confirm('This will replace ALL current categories and items with the default menu (160+ items). Continue?')) return
    try {
      const result = await call('seed_default_menu')
      await fetchCategories()
      showToast(result || 'Default menu loaded!')
    } catch (e) { showToast(typeof e === 'string' ? e : 'Seed failed', 'error') }
  }

  // ── Item image upload ──
  const handleItemImageUpload = async (item, file) => {
    if (!file) return
    setUploadingItemImage(item.id)
    try {
      const url = await uploadImage(file)
      await updateItemImage(item.id, url)
      showToast('Image uploaded!')
    } catch (e) {
      showToast(typeof e === 'string' ? e : 'Image upload failed', 'error')
    } finally {
      setUploadingItemImage(null)
      if (itemImageRef.current) itemImageRef.current.value = ''
    }
  }

  // ── Print & Logo ──
  const handleTestPrint = async () => {
    setTestPrinting(true)
    try {
      await call('print_receipt', {
        orderId: 0,
        items: [{ item_id: 1, name: 'Test Item', price: 99, qty: 1 }],
        total: 99,
        shopName: settings.shop_name,
        shopAddress: settings.shop_address,
        billFooter: settings.bill_footer,
      })
      showToast('Test print sent!')
    } catch (e) {
      showToast(typeof e === 'string' ? e : 'Print failed', 'error')
    } finally { setTestPrinting(false) }
  }

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { showToast('Please select an image file', 'error'); return }
    if (file.size > 5 * 1024 * 1024) { showToast('Image must be under 5MB', 'error'); return }
    setUploadingLogo(true)
    try {
      const reader = new FileReader()
      const base64Data = await new Promise((resolve, reject) => {
        reader.onload = () => { resolve(reader.result.split(',')[1]) }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      await saveLogo(base64Data)
      showToast('Logo uploaded!')
    } catch (e) {
      showToast(typeof e === 'string' ? e : 'Logo upload failed', 'error')
    } finally {
      setUploadingLogo(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDeleteLogo = async () => {
    try { await deleteLogo(); showToast('Logo removed') }
    catch (e) { showToast(typeof e === 'string' ? e : 'Failed to remove logo', 'error') }
  }

  const handleSaveCloudinary = async () => {
    try {
      await saveCloudinary(localCloudName.trim(), localUploadPreset.trim())
      showToast('Cloudinary settings saved!')
    } catch (e) { showToast('Failed to save', 'error') }
  }

  return (
    <div className="flex h-full overflow-hidden" style={{ background: '#f5f5f7' }}>
      {/* Left Sidebar: Categories */}
      <div className="w-60 flex flex-col glass-dark border-r border-gray-100">
        <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between">
          <span className="font-semibold text-gray-900 text-sm">Categories</span>
          <button
            onClick={() => setShowAddCat(true)}
            className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 text-white font-bold text-sm flex items-center justify-center hover:from-orange-500 hover:to-orange-700 transition-all shadow-sm"
            title="Add category"
          >+</button>
        </div>

        {showAddCat && (
          <div className="p-3 border-b border-gray-100 bg-orange-50/50">
            <input
              autoFocus
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
              placeholder="Category name"
              className="input-premium text-sm py-2"
            />
            <div className="flex gap-2 mt-2">
              <button onClick={handleAddCategory} className="flex-1 btn-primary text-xs py-2">Save</button>
              <button onClick={() => { setShowAddCat(false); setNewCatName('') }} className="flex-1 btn-secondary text-xs py-2">Cancel</button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {categories.map(cat => (
            <div
              key={cat.id}
              onClick={() => fetchItems(cat.id)}
              className={`px-4 py-3 cursor-pointer flex items-center gap-2 group transition-all border-l-3 ${
                selectedCategoryId === cat.id
                  ? 'bg-orange-50/80 border-l-[3px] border-l-orange-500'
                  : 'border-l-[3px] border-l-transparent hover:bg-gray-50'
              } ${!cat.is_active ? 'opacity-40' : ''}`}
            >
              {editingCatId === cat.id ? (
                <input
                  autoFocus
                  value={editingCatName}
                  onChange={e => setEditingCatName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleRenameCategory(cat)}
                  onBlur={() => handleRenameCategory(cat)}
                  onClick={e => e.stopPropagation()}
                  className="flex-1 input-premium text-sm py-1 px-2"
                />
              ) : (
                <span
                  className="flex-1 text-sm font-medium text-gray-700 truncate"
                  onDoubleClick={() => { setEditingCatId(cat.id); setEditingCatName(cat.name) }}
                >
                  {cat.name}
                </span>
              )}
              <button
                onClick={e => { e.stopPropagation(); handleToggleCategory(cat) }}
                className={`toggle-switch ${cat.is_active ? 'active' : ''}`}
                style={{ transform: 'scale(0.6)', transformOrigin: 'center' }}
              />
              <button
                onClick={e => { e.stopPropagation(); handleDeleteCategory(cat.id) }}
                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs transition-opacity"
              >✕</button>
            </div>
          ))}
          {categories.length === 0 && (
            <div className="text-center text-gray-400 text-sm py-10">
              No categories yet<br/>Click + to add one
            </div>
          )}
          {/* Load default menu button */}
          <div className="p-3 border-t border-gray-100">
            <button
              onClick={handleSeedMenu}
              className="w-full text-xs py-2 px-3 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium transition-colors border border-blue-200"
            >
              📦 Load Default Menu
            </button>
          </div>
        </div>
      </div>

      {/* Right: Content area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">

          {/* ═══════════════ MENU ITEMS SECTION ═══════════════ */}
          {selectedCategoryId ? (
            <div>
              <div className="settings-section-title">
                Items — {categories.find(c => c.id === selectedCategoryId)?.name ?? '—'}
              </div>
              <div className="settings-card">
                {items.map(item => (
                  <div key={item.id} className={`settings-row group ${!item.is_active ? 'opacity-40' : ''}`}>
                    {/* Thumbnail */}
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-50 flex-shrink-0 border border-gray-100">
                      {item.image_url ? (
                        <img src={getThumbnail(item.image_url, 80, 80)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300 text-lg">🍽️</div>
                      )}
                    </div>

                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800 text-sm truncate">{item.name}</div>
                    </div>

                    {/* Price */}
                    <div className="w-24">
                      {editingItemId === item.id ? (
                        <input
                          autoFocus
                          type="number"
                          value={editingItemPrice}
                          onChange={e => setEditingItemPrice(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleEditItemPrice(item)}
                          onBlur={() => handleEditItemPrice(item)}
                          className="input-premium text-sm py-1 px-2 w-full"
                        />
                      ) : (
                        <span
                          className="text-sm font-semibold text-orange-600 cursor-pointer hover:text-orange-700"
                          onClick={() => { setEditingItemId(item.id); setEditingItemPrice(String(item.price)) }}
                        >
                          ₹{item.price}
                        </span>
                      )}
                    </div>

                    {/* Image upload */}
                    <button
                      onClick={() => {
                        const input = document.createElement('input')
                        input.type = 'file'
                        input.accept = 'image/*'
                        input.onchange = (e) => handleItemImageUpload(item, e.target.files[0])
                        input.click()
                      }}
                      disabled={uploadingItemImage === item.id || !cloudName}
                      className="text-xs text-gray-400 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-30"
                      title={cloudName ? 'Upload image' : 'Configure Cloudinary first'}
                    >
                      {uploadingItemImage === item.id ? '⏳' : '📷'}
                    </button>

                    {/* Toggle */}
                    <button
                      onClick={() => handleToggleItem(item)}
                      className={`toggle-switch ${item.is_active ? 'active' : ''}`}
                      style={{ transform: 'scale(0.65)', transformOrigin: 'center' }}
                    />

                    {/* Delete */}
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs transition-opacity font-medium"
                    >✕</button>
                  </div>
                ))}

                {/* Add item row */}
                <div className="settings-row bg-gray-50/50">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-gray-300 text-sm">+</span>
                  </div>
                  <input
                    value={newItemName}
                    onChange={e => setNewItemName(e.target.value)}
                    placeholder="Item name"
                    className="input-premium text-sm py-2 flex-1"
                  />
                  <input
                    type="number"
                    value={newItemPrice}
                    onChange={e => setNewItemPrice(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddItem()}
                    placeholder="₹ Price"
                    className="input-premium text-sm py-2 w-24"
                  />
                  <button onClick={handleAddItem} className="btn-primary text-xs py-2 px-4">Add</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="card-premium p-12 text-center">
              <div className="text-5xl mb-3 opacity-40">👈</div>
              <p className="text-gray-500 font-medium">Select a category to manage items</p>
            </div>
          )}

          {/* ═══════════════ SHOP SETTINGS ═══════════════ */}
          <div>
            <div className="settings-section-title">Shop Information</div>
            <div className="settings-card">
              <div className="settings-row">
                <span className="text-sm text-gray-500 w-28 flex-shrink-0">Shop Name</span>
                <input
                  value={settings.shop_name}
                  onChange={e => saveSettings({ shop_name: e.target.value })}
                  className="input-premium text-sm flex-1"
                  placeholder="My Shop"
                />
              </div>
              <div className="settings-row">
                <span className="text-sm text-gray-500 w-28 flex-shrink-0">Tagline</span>
                <input
                  value={settings.shop_tagline}
                  onChange={e => saveSettings({ shop_tagline: e.target.value })}
                  className="input-premium text-sm flex-1"
                  placeholder="Crafted with Taste & Trust"
                />
              </div>
              <div className="settings-row">
                <span className="text-sm text-gray-500 w-28 flex-shrink-0">Address</span>
                <input
                  value={settings.shop_address}
                  onChange={e => saveSettings({ shop_address: e.target.value })}
                  className="input-premium text-sm flex-1"
                  placeholder="Near Main Market, City"
                />
              </div>
              <div className="settings-row">
                <span className="text-sm text-gray-500 w-28 flex-shrink-0">Phone</span>
                <input
                  value={settings.shop_phone}
                  onChange={e => saveSettings({ shop_phone: e.target.value })}
                  className="input-premium text-sm flex-1"
                  placeholder="+91 9XXXXXXXXX"
                />
              </div>
            </div>
          </div>

          {/* ═══════════════ RECEIPT SETTINGS ═══════════════ */}
          <div>
            <div className="settings-section-title">Receipt Settings</div>
            <div className="settings-card">
              <div className="settings-row">
                <span className="text-sm text-gray-500 w-28 flex-shrink-0">Bill Footer</span>
                <input
                  value={settings.bill_footer}
                  onChange={e => saveSettings({ bill_footer: e.target.value })}
                  className="input-premium text-sm flex-1"
                  placeholder="Thank you ❤️"
                />
              </div>
              <div className="settings-row">
                <span className="text-sm text-gray-500 w-28 flex-shrink-0">GST %</span>
                <input
                  type="number" min="0" max="28" step="0.5"
                  value={settings.gst_percent || 0}
                  onChange={e => saveSettings({ gst_percent: parseFloat(e.target.value) || 0 })}
                  className="input-premium text-sm w-24"
                  placeholder="5"
                />
              </div>
              <div className="settings-row">
                <span className="text-sm text-gray-500 w-28 flex-shrink-0">Payment Mode</span>
                <select
                  value={settings.payment_mode || ''}
                  onChange={e => saveSettings({ payment_mode: e.target.value })}
                  className="input-premium text-sm flex-1"
                >
                  <option value="">None</option>
                  <option value="Cash">💵 Cash</option>
                  <option value="UPI">📱 UPI</option>
                  <option value="Card">💳 Card</option>
                  <option value="Online">🌐 Online</option>
                </select>
              </div>

              {/* Logo */}
              <div className="settings-row items-start">
                <span className="text-sm text-gray-500 w-28 flex-shrink-0 mt-1">Receipt Logo</span>
                <div className="flex-1 flex items-start gap-3">
                  <div className="w-14 h-14 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {logoDataUri ? (
                      <img src={logoDataUri} alt="Logo" className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-gray-300 text-xl">🖼️</span>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-2">Watermark on PDF • Header on thermal</p>
                    <div className="flex gap-2">
                      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingLogo}
                        className="btn-primary text-xs py-1.5 px-3"
                      >
                        {uploadingLogo ? '⏳' : logoDataUri ? '🔄 Change' : '📤 Upload'}
                      </button>
                      {logoDataUri && (
                        <button onClick={handleDeleteLogo} className="text-red-500 hover:text-red-700 text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 transition-colors">
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ═══════════════ PRINTER SETTINGS ═══════════════ */}
          <div>
            <div className="settings-section-title">Printer Configuration</div>
            <div className="settings-card">
              <div className="settings-row">
                <span className="text-sm text-gray-500 w-28 flex-shrink-0">Connection</span>
                <select
                  value={settings.printer_type || 'usb'}
                  onChange={e => saveSettings({ printer_type: e.target.value })}
                  className="input-premium text-sm flex-1"
                >
                  <option value="usb">🔌 USB Port</option>
                  <option value="bluetooth">📶 Bluetooth (COM)</option>
                  <option value="network">🌐 Network (IP)</option>
                  <option value="name">🖨️ Windows Printer</option>
                </select>
              </div>

              <div className="settings-row">
                <span className="text-sm text-gray-500 w-28 flex-shrink-0">
                  {settings.printer_type === 'bluetooth' ? 'COM Port'
                    : settings.printer_type === 'network' ? 'IP Address'
                    : settings.printer_type === 'name' ? 'Printer'
                    : 'USB Port'}
                </span>
                {settings.printer_type === 'name' && detectedPrinters.length > 0 ? (
                  <select
                    value={settings.printer_name}
                    onChange={e => saveSettings({ printer_name: e.target.value })}
                    className="input-premium text-sm flex-1"
                  >
                    <option value="">— Select —</option>
                    {detectedPrinters.map((p, i) => (
                      <option key={i} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={settings.printer_name}
                    onChange={e => saveSettings({ printer_name: e.target.value })}
                    className="input-premium text-sm flex-1"
                    placeholder={
                      settings.printer_type === 'bluetooth' ? 'COM3'
                        : settings.printer_type === 'network' ? '192.168.1.100:9100'
                        : settings.printer_type === 'name' ? 'POS-58'
                        : 'USB001'
                    }
                  />
                )}
              </div>

              <div className="settings-row">
                <span className="text-sm text-gray-500 w-28 flex-shrink-0">Auto-Cut</span>
                <button
                  onClick={() => saveSettings({ has_cutter: !settings.has_cutter })}
                  className={`toggle-switch ${settings.has_cutter ? 'active' : ''}`}
                />
                <span className="text-xs text-gray-400 ml-2">{settings.has_cutter ? 'Enabled' : 'Disabled'}</span>
              </div>
            </div>

            {/* Detected printers */}
            {detectedPrinters.length > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-xs font-semibold text-blue-600">🖨️ Detected ({detectedPrinters.length})</span>
                  <button onClick={detectPrinters} disabled={loadingPrinters} className="text-xs text-blue-500 hover:text-blue-700 font-medium">
                    {loadingPrinters ? '⏳' : '🔄 Refresh'}
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {detectedPrinters.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => saveSettings({ printer_name: p.name, printer_type: 'name' })}
                      className={`card-interactive flex items-center gap-3 px-4 py-3 text-left text-xs ${
                        settings.printer_name === p.name && settings.printer_type === 'name' ? 'active' : ''
                      }`}
                    >
                      <span className="text-base">
                        {p.name.toLowerCase().includes('pdf') ? '📄'
                          : p.name.toLowerCase().includes('fax') ? '📠'
                          : p.name.toLowerCase().includes('onenote') || p.name.toLowerCase().includes('xps') ? '📝'
                          : '🖨️'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate text-sm">{p.name}</div>
                        <div className="text-[10px] text-gray-400 truncate">{p.driver} • {p.port_name}</div>
                      </div>
                      {settings.printer_name === p.name && settings.printer_type === 'name' && (
                        <span className="text-orange-500 font-bold">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {detectedPrinters.length === 0 && !loadingPrinters && (
              <div className="mt-3 card-premium p-3 flex items-center justify-between">
                <span className="text-xs text-gray-400">No printers detected</span>
                <button onClick={detectPrinters} className="text-xs text-orange-500 hover:text-orange-700 font-medium">
                  🔍 Scan
                </button>
              </div>
            )}

            {loadingPrinters && detectedPrinters.length === 0 && (
              <div className="mt-3 card-premium p-4 flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-gray-500">Scanning for printers…</span>
              </div>
            )}

            {/* Test Print */}
            <div className="mt-3 flex justify-end">
              <button
                onClick={handleTestPrint}
                disabled={testPrinting}
                className="btn-secondary text-sm px-5 py-2.5 flex items-center gap-2"
              >
                {testPrinting ? (
                  <><div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> Printing…</>
                ) : (
                  <>🖨️ Test Print</>
                )}
              </button>
            </div>
          </div>

          {/* ═══════════════ CLOUDINARY SETTINGS ═══════════════ */}
          <div>
            <div className="settings-section-title">☁️ Product Images (Cloudinary)</div>
            <div className="settings-card">
              <div className="settings-row items-start">
                <span className="text-sm text-gray-500 w-28 flex-shrink-0 mt-2">Cloud Name</span>
                <div className="flex-1">
                  <input
                    value={localCloudName}
                    onChange={e => setLocalCloudName(e.target.value)}
                    className="input-premium text-sm"
                    placeholder="your-cloud-name"
                  />
                  <p className="text-xs text-gray-400 mt-1">From Cloudinary Dashboard → Account Details</p>
                </div>
              </div>
              <div className="settings-row items-start">
                <span className="text-sm text-gray-500 w-28 flex-shrink-0 mt-2">Upload Preset</span>
                <div className="flex-1">
                  <input
                    value={localUploadPreset}
                    onChange={e => setLocalUploadPreset(e.target.value)}
                    className="input-premium text-sm"
                    placeholder="billeasy-unsigned"
                  />
                  <p className="text-xs text-gray-400 mt-1">Settings → Upload → Add unsigned preset</p>
                </div>
              </div>
              <div className="settings-row justify-end">
                <button
                  onClick={handleSaveCloudinary}
                  className="btn-primary text-xs py-2 px-5"
                >
                  Save Cloudinary Config
                </button>
              </div>
            </div>
            {!cloudName && (
              <div className="mt-2 px-1">
                <p className="text-xs text-amber-600">
                  ⚠️ Configure Cloudinary to enable product image uploads on items
                </p>
              </div>
            )}
          </div>

          {/* Bottom spacer */}
          <div className="h-6" />
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl shadow-lg text-white text-sm font-medium z-50 toast-enter ${
          toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
