import { useEffect, useState } from 'react'
import { useCartStore } from '../store/cartStore'
import { useSettingsStore } from '../store/settingsStore'
import { call } from '../lib/tauri'
import ReceiptPreview from './ReceiptPreview'

export default function Cart({ onPrintSuccess, onPrintError }) {
  const { quantities, items, clear, increment: incStore, decrement: decStore, getCartItems, getTotal } = useCartStore()
  const { settings, fetchSettings } = useSettingsStore()
  const [isPrinting, setIsPrinting] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewOrderId, setPreviewOrderId] = useState(0)

  useEffect(() => { fetchSettings() }, [])

  const cartItems = getCartItems()
  const subtotal = getTotal()
  const gstPercent = settings.gst_percent || 0
  const gstAmount = subtotal * gstPercent / 100
  const grandTotal = subtotal + gstAmount
  const itemCount = cartItems.reduce((sum, i) => sum + i.qty, 0)

  // Enter to print (only when not in input)
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Enter' && cartItems.length > 0 && !isPrinting && !showPreview) {
        if (document.activeElement?.tagName === 'INPUT') return
        handlePrintAndClear()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [cartItems, isPrinting, showPreview])

  const handlePrintAndClear = async () => {
    if (cartItems.length === 0 || isPrinting) return
    setIsPrinting(true)
    try {
      const orderId = await call('save_order', {
        items: cartItems.map(i => ({ item_id: i.id, name: i.name, price: i.price, qty: i.qty })),
        subtotal, total: grandTotal,
      })
      await call('print_receipt', {
        orderId,
        items: cartItems.map(i => ({ item_id: i.id, name: i.name, price: i.price, qty: i.qty })),
        total: grandTotal,
        shopName: settings.shop_name,
        shopAddress: settings.shop_address,
        billFooter: settings.bill_footer,
      })
      clear()
      onPrintSuccess?.()
    } catch (e) {
      onPrintError?.(typeof e === 'string' ? e : 'Print failed — check printer')
    } finally { setIsPrinting(false) }
  }

  const handlePdfPreview = async () => {
    if (cartItems.length === 0) return
    try {
      const orderId = await call('save_order', {
        items: cartItems.map(i => ({ item_id: i.id, name: i.name, price: i.price, qty: i.qty })),
        subtotal, total: grandTotal,
      })
      setPreviewOrderId(orderId)
      setShowPreview(true)
    } catch (e) {
      onPrintError?.(typeof e === 'string' ? e : 'Failed to save order')
    }
  }

  const handlePreviewClose = () => {
    setShowPreview(false)
    if (previewOrderId > 0) { clear(); onPrintSuccess?.() }
  }

  return (
    <div className="bill-panel w-80 flex-shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
        <div>
          <h2 className="font-heading font-bold text-stone-900 text-[15px]">Current Bill</h2>
          {itemCount > 0 && (
            <span className="text-xs text-stone-400">{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
          )}
        </div>
        {cartItems.length > 0 && (
          <button
            onClick={clear}
            className="text-xs text-red-400 hover:text-red-600 font-medium px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Cart Items */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {cartItems.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-3xl opacity-30 mb-2">🧾</div>
            <p className="text-sm text-stone-400 font-medium">No items yet</p>
            <p className="text-xs text-stone-300 mt-0.5">Tap items to add</p>
          </div>
        ) : (
          <div className="space-y-0">
            {cartItems.map(item => (
              <div key={item.id} className="bill-item">
                {/* Name + unit price */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-stone-800 truncate">{item.name}</div>
                  <div className="text-xs text-stone-400">₹{item.price} each</div>
                </div>

                {/* Qty controls */}
                <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => decStore(item.id)}
                    className="add-btn minus sm"
                  >−</button>
                  <span className="font-mono font-bold text-stone-800 text-sm min-w-[20px] text-center">{item.qty}</span>
                  <button
                    onClick={() => incStore(items[item.id] || item)}
                    className="add-btn sm"
                  >+</button>
                </div>

                {/* Line total */}
                <div className="font-mono font-bold text-stone-900 text-sm w-16 text-right">
                  ₹{item.total}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Totals + Print */}
      <div className="border-t border-stone-100 px-4 py-3 space-y-2">
        {/* Subtotal */}
        <div className="flex justify-between text-sm">
          <span className="text-stone-500">Subtotal</span>
          <span className="font-mono font-medium text-stone-700">₹{subtotal}</span>
        </div>

        {/* GST */}
        {gstPercent > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-stone-500">GST ({gstPercent}%)</span>
            <span className="font-mono font-medium text-stone-700">₹{gstAmount.toFixed(0)}</span>
          </div>
        )}

        {/* Grand Total */}
        <div className="flex justify-between items-center pt-1 border-t border-stone-100">
          <span className="font-heading font-bold text-stone-900">Total</span>
          <span className="font-mono font-bold text-2xl text-stone-900">₹{grandTotal.toFixed(0)}</span>
        </div>

        {/* Print buttons */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handlePrintAndClear}
            disabled={cartItems.length === 0 || isPrinting}
            className="btn-primary flex-1 py-3.5 text-[15px] flex items-center justify-center gap-2"
          >
            {isPrinting ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Printing…</>
            ) : (
              <>🖨️ Print Bill</>
            )}
          </button>
          <button
            onClick={handlePdfPreview}
            disabled={cartItems.length === 0 || isPrinting}
            title="PDF / Windows printer"
            className="btn-secondary w-12 py-3.5 text-base flex items-center justify-center disabled:opacity-40"
          >📄</button>
        </div>

        {/* Shortcut hint */}
        <p className="text-center text-[11px] text-stone-400 pt-0.5">
          <kbd className="font-mono bg-stone-100 rounded px-1 py-0.5 text-[10px]">Enter</kbd> print &nbsp;·&nbsp;
          <kbd className="font-mono bg-stone-100 rounded px-1 py-0.5 text-[10px]">/</kbd> search
        </p>
      </div>

      {/* Receipt Preview */}
      {showPreview && (
        <ReceiptPreview
          orderId={previewOrderId}
          items={cartItems.map(i => ({ item_id: i.id, name: i.name, price: i.price, qty: i.qty }))}
          total={grandTotal}
          shopName={settings.shop_name}
          shopAddress={settings.shop_address}
          billFooter={settings.bill_footer}
          onClose={handlePreviewClose}
        />
      )}
    </div>
  )
}
