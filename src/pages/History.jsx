import { useEffect, useState } from 'react'
import { call } from '../lib/tauri'
import ReceiptPreview from '../components/ReceiptPreview'

const PAGE_SIZE = 20

export default function History() {
  const [summary, setSummary] = useState(null)
  const [orders, setOrders] = useState([])
  const [date, setDate] = useState('')
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const [previewOrder, setPreviewOrder] = useState(null)
  const [settings, setSettings] = useState(null)

  useEffect(() => {
    loadSummary()
    loadOrders()
    loadSettings()
  }, [])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const loadSettings = async () => {
    try {
      const s = await call('get_settings')
      setSettings(s)
    } catch (e) { console.error(e) }
  }

  const loadSummary = async () => {
    try {
      const s = await call('get_summary')
      setSummary(s)
    } catch (e) { console.error(e) }
  }

  const loadOrders = async (selectedDate) => {
    setLoading(true)
    try {
      const d = selectedDate ?? date
      const o = await call('get_orders', { date: d || null })
      setOrders(o)
      setPage(0)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const handleDateChange = (e) => {
    setDate(e.target.value)
    loadOrders(e.target.value)
  }

  const handleReprint = async (order) => {
    try {
      const s = settings || await call('get_settings')
      await call('print_receipt', {
        orderId: order.id,
        items: order.items,
        total: order.total,
        shopName: s.shop_name,
        shopAddress: s.shop_address,
        billFooter: s.bill_footer,
      })
      showToast('Receipt reprinted!')
    } catch (e) {
      showToast(typeof e === 'string' ? e : 'Reprint failed', 'error')
    }
  }

  const handlePdfPreview = async (order) => {
    if (!settings) {
      try {
        const s = await call('get_settings')
        setSettings(s)
      } catch (e) {
        showToast('Failed to load settings', 'error')
        return
      }
    }
    setPreviewOrder(order)
  }

  const formatTime = (dt) => {
    const d = new Date(dt)
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  }

  const formatItems = (items) =>
    items.map(i => `${i.name} ×${i.qty}`).join(', ')

  const paged = orders.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(orders.length / PAGE_SIZE)

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      {/* Summary bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-8">
        <div>
          <div className="text-xs text-gray-500 font-medium">Today's Revenue</div>
          <div className="text-2xl font-bold text-brand-600">
            ₹{summary?.today_total?.toFixed(0) ?? '—'}
          </div>
          <div className="text-xs text-gray-400">{summary?.today_count ?? 0} bills</div>
        </div>
        <div className="w-px h-12 bg-gray-200" />
        <div>
          <div className="text-xs text-gray-500 font-medium">This Week</div>
          <div className="text-xl font-bold text-gray-700">
            ₹{summary?.week_total?.toFixed(0) ?? '—'}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <label className="text-sm text-gray-600 font-medium">Filter by date:</label>
          <input
            type="date"
            value={date}
            onChange={handleDateChange}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
          />
          {date && (
            <button
              onClick={() => { setDate(''); loadOrders('') }}
              className="text-xs text-gray-500 hover:text-gray-700 underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Orders table */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400">
            <div className="text-center">
              <div className="text-4xl mb-2">📋</div>
              <p>No bills found{date ? ` for ${date}` : ''}</p>
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-gray-200 sticky top-0">
              <tr>
                <th className="text-left px-6 py-3 font-medium text-gray-500 text-xs uppercase">Bill #</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase">Time</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase">Items</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase">Total</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500 text-xs uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {paged.map(order => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-gray-500 font-mono text-xs">#{order.id}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatTime(order.created_at)}</td>
                  <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{formatItems(order.items)}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-800">₹{order.total.toFixed(0)}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleReprint(order)}
                        className="text-brand-500 hover:text-brand-700 font-medium text-xs hover:underline"
                        title="Reprint receipt on thermal printer"
                      >
                        🖨️ Reprint
                      </button>
                      <button
                        onClick={() => handlePdfPreview(order)}
                        className="text-gray-500 hover:text-gray-700 font-medium text-xs hover:underline"
                        title="Preview and print via Windows printer or save as PDF"
                      >
                        📄 PDF
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="bg-white border-t border-gray-200 px-6 py-3 flex items-center justify-between">
          <span className="text-sm text-gray-500">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, orders.length)} of {orders.length} bills
          </span>
          <div className="flex gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1 text-sm rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1 text-sm rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Receipt Preview Modal */}
      {previewOrder && settings && (
        <ReceiptPreview
          orderId={previewOrder.id}
          items={previewOrder.items}
          total={previewOrder.total}
          shopName={settings.shop_name}
          shopAddress={settings.shop_address}
          billFooter={settings.bill_footer}
          onClose={() => setPreviewOrder(null)}
        />
      )}

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
