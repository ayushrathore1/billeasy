import { useEffect, useRef, useState } from 'react'
import { call } from '../lib/tauri'

/**
 * ReceiptPreview — Modal component that renders a receipt as HTML in an iframe.
 * Allows printing via Windows printer (including "Microsoft Print to PDF" for PDF download).
 *
 * Props:
 *   orderId, items, total, shopName, shopAddress, billFooter — receipt data
 *   onClose — callback to close the modal
 */
export default function ReceiptPreview({
  orderId = 0,
  items = [],
  total = 0,
  shopName = '',
  shopAddress = '',
  billFooter = '',
  onClose,
}) {
  const iframeRef = useRef(null)
  const [html, setHtml] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await call('generate_receipt_html', {
          orderId,
          items: items.map(i => ({
            item_id: i.item_id || i.id || 0,
            name: i.name,
            price: i.price,
            qty: i.qty,
          })),
          total,
          shopName,
          shopAddress,
          billFooter,
        })
        if (!cancelled) {
          setHtml(result)
          setLoading(false)
        }
      } catch (e) {
        if (!cancelled) {
          setError(typeof e === 'string' ? e : 'Failed to generate receipt')
          setLoading(false)
        }
      }
    })()
    return () => { cancelled = true }
  }, [orderId, items, total, shopName, shopAddress, billFooter])

  // Write HTML to iframe once ready
  useEffect(() => {
    if (html && iframeRef.current) {
      const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow.document
      doc.open()
      doc.write(html)
      doc.close()
    }
  }, [html])

  const handlePrint = () => {
    if (iframeRef.current) {
      iframeRef.current.contentWindow.focus()
      iframeRef.current.contentWindow.print()
    }
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] w-[420px] overflow-hidden animate-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50 rounded-t-2xl">
          <div>
            <h3 className="font-bold text-gray-800 text-sm">📄 Receipt Preview</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Print to PDF or any Windows printer
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none p-1 rounded-lg hover:bg-gray-200 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Receipt iframe */}
        <div className="flex-1 overflow-auto bg-gray-100 p-4 min-h-[300px]">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full text-red-500 text-sm">
              {error}
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              className="w-full bg-white rounded-lg shadow-md border-0"
              style={{ height: '500px' }}
              title="Receipt Preview"
            />
          )}
        </div>

        {/* Actions */}
        <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 rounded-b-2xl flex items-center gap-3">
          <button
            onClick={handlePrint}
            disabled={loading || !!error}
            className="flex-1 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
          >
            🖨️ Print / Save as PDF
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-800 bg-gray-200 hover:bg-gray-300 rounded-xl transition-colors font-medium"
          >
            Close
          </button>
        </div>

        {/* Help tip */}
        <div className="px-5 py-2 bg-blue-50 border-t border-blue-100 rounded-b-2xl">
          <p className="text-xs text-blue-600">
            💡 <strong>Tip:</strong> Select <strong>"Microsoft Print to PDF"</strong> as the printer to download as a PDF file.
          </p>
        </div>
      </div>
    </div>
  )
}
