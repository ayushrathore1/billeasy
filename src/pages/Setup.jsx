import { useEffect, useState } from 'react'
import { useMenuStore } from '../store/menuStore'
import { useSettingsStore } from '../store/settingsStore'
import { call } from '../lib/tauri'

export default function Setup() {
  const {
    categories, items, selectedCategoryId,
    fetchCategories, fetchItems,
    createCategory, updateCategory, deleteCategory,
    createItem, updateItem, deleteItem,
  } = useMenuStore()
  const { settings, fetchSettings, saveSettings } = useSettingsStore()

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

  useEffect(() => {
    fetchCategories()
    fetchSettings()
  }, [])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

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

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Categories */}
      <div className="w-64 flex flex-col bg-white border-r border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-700 text-sm flex items-center justify-between bg-gray-50">
          Categories
          <button
            onClick={() => setShowAddCat(true)}
            className="text-brand-500 hover:text-brand-700 font-bold text-xl leading-none"
            title="Add category"
          >+</button>
        </div>

        {/* Add category inline */}
        {showAddCat && (
          <div className="p-3 border-b border-gray-100 bg-brand-50">
            <input
              autoFocus
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
              placeholder="Category name"
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-brand-500 outline-none"
            />
            <div className="flex gap-2 mt-2">
              <button onClick={handleAddCategory} className="flex-1 bg-brand-500 text-white text-xs rounded py-1 font-medium hover:bg-brand-600">Save</button>
              <button onClick={() => { setShowAddCat(false); setNewCatName('') }} className="flex-1 bg-gray-200 text-gray-600 text-xs rounded py-1 hover:bg-gray-300">Cancel</button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {categories.map(cat => (
            <div
              key={cat.id}
              onClick={() => fetchItems(cat.id)}
              className={`px-4 py-3 border-b border-gray-50 cursor-pointer flex items-center gap-2 group hover:bg-gray-50 ${
                selectedCategoryId === cat.id ? 'bg-brand-50 border-l-4 border-l-brand-500' : ''
              } ${!cat.is_active ? 'opacity-50' : ''}`}
            >
              {editingCatId === cat.id ? (
                <input
                  autoFocus
                  value={editingCatName}
                  onChange={e => setEditingCatName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleRenameCategory(cat)}
                  onBlur={() => handleRenameCategory(cat)}
                  onClick={e => e.stopPropagation()}
                  className="flex-1 border border-gray-300 rounded px-1 py-0.5 text-sm outline-none focus:ring-1 focus:ring-brand-500"
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
                className={`text-xs rounded px-1.5 py-0.5 font-medium transition-colors ${
                  cat.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {cat.is_active ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={e => { e.stopPropagation(); handleDeleteCategory(cat.id) }}
                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs transition-opacity"
              >✕</button>
            </div>
          ))}
          {categories.length === 0 && (
            <div className="text-center text-gray-400 text-sm py-8">
              No categories yet.<br/>Click + to add one.
            </div>
          )}
        </div>
      </div>

      {/* Right: Items + Settings */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedCategoryId ? (
          <>
            <div className="px-6 py-3 border-b border-gray-200 font-semibold text-gray-700 text-sm bg-gray-50">
              Items in: {categories.find(c => c.id === selectedCategoryId)?.name ?? '—'}
            </div>
            <div className="flex-1 overflow-y-auto">
              {/* Items table */}
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase sticky top-0">
                  <tr>
                    <th className="text-left px-6 py-2 font-medium">Name</th>
                    <th className="text-left px-4 py-2 font-medium">Price</th>
                    <th className="text-center px-4 py-2 font-medium">Active</th>
                    <th className="text-center px-4 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map(item => (
                    <tr key={item.id} className={`hover:bg-gray-50 ${!item.is_active ? 'opacity-50' : ''}`}>
                      <td className="px-6 py-3 font-medium text-gray-800">{item.name}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {editingItemId === item.id ? (
                          <input
                            autoFocus
                            type="number"
                            value={editingItemPrice}
                            onChange={e => setEditingItemPrice(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleEditItemPrice(item)}
                            onBlur={() => handleEditItemPrice(item)}
                            className="w-20 border border-gray-300 rounded px-1.5 py-0.5 text-sm outline-none focus:ring-1 focus:ring-brand-500"
                          />
                        ) : (
                          <span
                            className="cursor-pointer hover:text-brand-600 hover:underline"
                            onClick={() => { setEditingItemId(item.id); setEditingItemPrice(String(item.price)) }}
                          >
                            ₹{item.price}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleToggleItem(item)}
                          className={`text-xs rounded px-2 py-1 font-medium transition-colors ${
                            item.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {item.is_active ? 'ON' : 'OFF'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="text-red-400 hover:text-red-600 text-xs font-medium hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}

                  {/* Add item row */}
                  <tr className="bg-gray-50">
                    <td className="px-6 py-3">
                      <input
                        value={newItemName}
                        onChange={e => setNewItemName(e.target.value)}
                        placeholder="Item name"
                        className="border border-gray-300 rounded px-2 py-1 text-sm w-40 outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        value={newItemPrice}
                        onChange={e => setNewItemPrice(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddItem()}
                        placeholder="Price"
                        className="border border-gray-300 rounded px-2 py-1 text-sm w-20 outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </td>
                    <td colSpan={2} className="px-4 py-3">
                      <button
                        onClick={handleAddItem}
                        className="bg-brand-500 text-white text-xs font-semibold rounded px-3 py-1.5 hover:bg-brand-600 transition-colors"
                      >
                        + Add Item
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <div className="text-5xl mb-3">👈</div>
              <p className="text-sm">Select a category to manage its items</p>
            </div>
          </div>
        )}

        {/* Settings panel at bottom */}
        <div className="border-t border-gray-200 bg-white p-4">
          <div className="text-sm font-semibold text-gray-700 mb-3">⚙️ Shop Settings</div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-500 font-medium">Shop Name</label>
              <input
                value={settings.shop_name}
                onChange={e => saveSettings({ shop_name: e.target.value })}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mt-0.5 outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Address</label>
              <input
                value={settings.shop_address}
                onChange={e => saveSettings({ shop_address: e.target.value })}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mt-0.5 outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Bill Footer</label>
              <input
                value={settings.bill_footer}
                onChange={e => saveSettings({ bill_footer: e.target.value })}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mt-0.5 outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Printer Connection</label>
              <select
                value={settings.printer_type || 'usb'}
                onChange={e => saveSettings({ printer_type: e.target.value })}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mt-0.5 outline-none focus:ring-1 focus:ring-brand-500 bg-white"
              >
                <option value="usb">🔌 USB Port</option>
                <option value="bluetooth">📶 Bluetooth (COM Port)</option>
                <option value="network">🌐 Network (IP Address)</option>
                <option value="name">🖨️ Windows Printer Name</option>
              </select>
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-xs text-gray-500 font-medium">
                {settings.printer_type === 'bluetooth' ? 'Bluetooth COM Port'
                  : settings.printer_type === 'network' ? 'Printer IP Address'
                  : settings.printer_type === 'name' ? 'Shared Printer Name'
                  : 'USB Port Name'}
              </label>
              <input
                value={settings.printer_name}
                onChange={e => saveSettings({ printer_name: e.target.value })}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mt-0.5 outline-none focus:ring-1 focus:ring-brand-500"
                placeholder={
                  settings.printer_type === 'bluetooth' ? 'COM3'
                    : settings.printer_type === 'network' ? '192.168.1.100:9100'
                    : settings.printer_type === 'name' ? 'POS-58'
                    : 'USB001'
                }
              />
              <p className="text-xs text-gray-400 mt-0.5">
                {settings.printer_type === 'bluetooth'
                  ? 'Pair printer in Windows Settings → Bluetooth first, then use assigned COM port'
                  : settings.printer_type === 'network'
                  ? 'Enter printer IP. Port 9100 is used if not specified'
                  : settings.printer_type === 'name'
                  ? 'Use the exact Windows shared printer name'
                  : 'Usually USB001 — check in Device Manager → Ports'}
              </p>
            </div>
            <button
              onClick={handleTestPrint}
              disabled={testPrinting}
              className="bg-gray-700 text-white text-xs font-medium px-4 py-2 rounded hover:bg-gray-800 disabled:opacity-50 transition-colors whitespace-nowrap mb-5"
            >
              {testPrinting ? 'Printing…' : '🖨️ Test Print'}
            </button>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium z-50 toast-enter ${
          toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
