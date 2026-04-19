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
  const [dataInfo, setDataInfo] = useState(null)

  useEffect(() => {
    loadSummary()
    loadOrders()
    loadSettings()
    loadDataInfo()
  }, [])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }

  const loadSettings = async () => {
    try { setSettings(await call('get_settings')) } catch (e) { console.error(e) }
  }

  const loadSummary = async () => {
    try { setSummary(await call('get_summary')) } catch (e) { console.error(e) }
  }

  const loadDataInfo = async () => {
    try { setDataInfo(await call('get_data_info')) } catch (e) { console.error(e) }
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
        orderId: order.id, items: order.items, total: order.total,
        shopName: s.shop_name, shopAddress: s.shop_address, billFooter: s.bill_footer,
      })
      showToast('Receipt reprinted!')
    } catch (e) { showToast(typeof e === 'string' ? e : 'Reprint failed', 'error') }
  }

  const handlePdfPreview = async (order) => {
    if (!settings) {
      try { setSettings(await call('get_settings')) }
      catch (e) { showToast('Failed to load settings', 'error'); return }
    }
    setPreviewOrder(order)
  }

  const handleOpenExcel = async () => {
    try {
      await call('open_orders_csv')
      showToast('Opening in Excel…')
    } catch (e) {
      showToast(typeof e === 'string' ? e : 'Failed to open file', 'error')
    }
  }

  const formatTime = (dt) => new Date(dt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  const formatItems = (items) => items.map(i => `${i.name} ×${i.qty}`).join(', ')

  const paged = orders.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(orders.length / PAGE_SIZE)

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#fff7ed' }}>
      {/* Summary bar */}
      <div className="bg-white border-b border-stone-100 px-6 py-4 flex items-center gap-8">
        <div>
          <div className="text-xs text-stone-400 font-medium uppercase tracking-wide">Today's Revenue</div>
          <div className="font-mono text-2xl font-bold text-stone-900">
            ₹{summary?.today_total?.toFixed(0) ?? '—'}
          </div>
          <div className="text-xs text-stone-400">{summary?.today_count ?? 0} bills</div>
        </div>
        <div className="w-px h-10 bg-stone-100" />
        <div>
          <div className="text-xs text-stone-400 font-medium uppercase tracking-wide">This Week</div>
          <div className="font-mono text-xl font-bold text-stone-700">
            ₹{summary?.week_total?.toFixed(0) ?? '—'}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {/* Date filter */}
          <label className="text-sm text-stone-500 font-medium">Date:</label>
          <input
            type="date"
            value={date}
            onChange={handleDateChange}
            className="input-premium text-sm py-2 px-3 w-auto"
          />
          {date && (
            <button onClick={() => { setDate(''); loadOrders('') }} className="text-xs text-stone-400 hover:text-stone-600 underline">
              Clear
            </button>
          )}

          {/* Open Excel button */}
          <button
            onClick={handleOpenExcel}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors"
            title={dataInfo?.csv_path ? `Opens: ${dataInfo.csv_path}` : 'Open orders in Excel'}
          >
            <span className="text-base">📊</span>
            Open Excel
          </button>
        </div>
      </div>

      {/* Data location info */}
      {dataInfo?.data_dir && (
        <div className="px-6 py-1.5 bg-amber-50 border-b border-amber-100 text-xs text-amber-700 flex items-center gap-1.5">
          <span>💾</span>
          <span>Data saved in: <strong>{dataInfo.data_dir}</strong> — safe across reinstalls</span>
        </div>
      )}

      {/* Orders table */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-7 h-7 border-3 border-orange-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex items-center justify-center h-40">
            <div className="text-center">
              <div className="text-4xl mb-2 opacity-30">📋</div>
              <p className="text-stone-400">No bills found{date ? ` for ${date}` : ''}</p>
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-stone-100 sticky top-0">
              <tr>
                <th className="text-left px-6 py-3 font-medium text-stone-400 text-xs uppercase tracking-wide">Bill #</th>
                <th className="text-left px-4 py-3 font-medium text-stone-400 text-xs uppercase tracking-wide">Time</th>
                <th className="text-left px-4 py-3 font-medium text-stone-400 text-xs uppercase tracking-wide">Items</th>
                <th className="text-right px-4 py-3 font-medium text-stone-400 text-xs uppercase tracking-wide">Total</th>
                <th className="text-center px-4 py-3 font-medium text-stone-400 text-xs uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50 bg-white">
              {paged.map(order => (
                <tr key={order.id} className="hover:bg-orange-50/30 transition-colors">
                  <td className="px-6 py-3 font-mono text-stone-500 text-xs">#{order.id}</td>
                  <td className="px-4 py-3 text-stone-600 whitespace-nowrap">{formatTime(order.created_at)}</td>
                  <td className="px-4 py-3 text-stone-700 max-w-xs truncate">{formatItems(order.items)}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-stone-800">₹{order.total.toFixed(0)}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => handleReprint(order)} className="text-orange-500 hover:text-orange-700 font-medium text-xs hover:underline" title="Thermal reprint">
                        🖨️ Reprint
                      </button>
                      <button onClick={() => handlePdfPreview(order)} className="text-stone-400 hover:text-stone-600 font-medium text-xs hover:underline" title="PDF preview">
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
        <div className="bg-white border-t border-stone-100 px-6 py-3 flex items-center justify-between">
          <span className="text-sm text-stone-400">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, orders.length)} of {orders.length}
          </span>
          <div className="flex gap-2">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="btn-secondary text-sm px-3 py-1.5 disabled:opacity-40">Previous</button>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="btn-secondary text-sm px-3 py-1.5 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}

      {/* Receipt Preview Modal */}
      {previewOrder && settings && (
        <ReceiptPreview
          orderId={previewOrder.id} items={previewOrder.items} total={previewOrder.total}
          shopName={settings.shop_name} shopAddress={settings.shop_address} billFooter={settings.bill_footer}
          onClose={() => setPreviewOrder(null)}
        />
      )}

      {toast && (
        <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl shadow-lg text-white text-sm font-medium z-50 toast-enter ${toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
