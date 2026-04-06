import { useEffect, useState } from 'react'
import { useCartStore } from '../store/cartStore'
import { useSettingsStore } from '../store/settingsStore'
import { call } from '../lib/tauri'

export default function Cart({ onPrintSuccess, onPrintError }) {
  const { quantities, items, clear, getCartItems, getTotal } = useCartStore()
  const { settings, fetchSettings } = useSettingsStore()
  const [isPrinting, setIsPrinting] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [])

  const cartItems = getCartItems()
  const total = getTotal()

  // Enter key to print
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Enter' && cartItems.length > 0 && !isPrinting) {
        handlePrintAndClear()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [cartItems, isPrinting])

  const handlePrintAndClear = async () => {
    if (cartItems.length === 0 || isPrinting) return

    setIsPrinting(true)
    try {
      // 1. Save the order
      const orderId = await call('save_order', {
        items: cartItems.map(i => ({
          item_id: i.id,
          name: i.name,
          price: i.price,
          qty: i.qty,
        })),
        subtotal: total,
        total: total,
      })

      // 2. Print the receipt
      await call('print_receipt', {
        orderId,
        items: cartItems.map(i => ({
          item_id: i.id,
          name: i.name,
          price: i.price,
          qty: i.qty,
        })),
        total,
        shopName: settings.shop_name,
        shopAddress: settings.shop_address,
        billFooter: settings.bill_footer,
      })

      // 3. Clear cart on success
      clear()
      onPrintSuccess?.()
    } catch (e) {
      // Cart NOT cleared — cashier can retry
      onPrintError?.(typeof e === 'string' ? e : 'Print failed — check printer connection')
    } finally {
      setIsPrinting(false)
    }
  }

  return (
    <div className="w-72 flex flex-col bg-white border-l border-gray-200 shadow-xl">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h2 className="font-bold text-gray-800 text-base">🛒 Current Bill</h2>
        {cartItems.length > 0 && (
          <button
            onClick={clear}
            className="text-xs text-red-400 hover:text-red-600 mt-0.5"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Cart items */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {cartItems.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            <div className="text-4xl mb-2">🛒</div>
            <p className="text-sm">Tap items to add them</p>
          </div>
        ) : (
          cartItems.map(item => (
            <div key={item.id} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 truncate">{item.name}</div>
                <div className="text-xs text-gray-500">₹{item.price} × {item.qty}</div>
              </div>
              <div className="text-sm font-bold text-gray-900 whitespace-nowrap">
                ₹{item.total}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Total + Print */}
      <div className="border-t border-gray-200 p-4 space-y-3">
        <div className="flex justify-between items-center">
          <span className="font-semibold text-gray-700">Total</span>
          <span className="text-2xl font-bold text-brand-600">₹{total}</span>
        </div>

        <button
          onClick={handlePrintAndClear}
          disabled={cartItems.length === 0 || isPrinting}
          className="w-full py-4 rounded-xl font-bold text-base transition-all flex items-center justify-center gap-2 min-h-[56px] disabled:opacity-40 disabled:cursor-not-allowed bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white shadow-md hover:shadow-lg"
        >
          {isPrinting ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Printing…
            </>
          ) : (
            <>🖨️ Print & Clear</>
          )}
        </button>

        <p className="text-center text-xs text-gray-400">
          Press <kbd className="bg-gray-100 rounded px-1 py-0.5 font-mono">Enter</kbd> to print
        </p>
      </div>
    </div>
  )
}
