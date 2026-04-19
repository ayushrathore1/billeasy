import { useEffect, useState, useRef, useCallback } from 'react'
import { useMenuStore } from '../store/menuStore'
import { useCartStore } from '../store/cartStore'
import CategoryTabs from '../components/CategoryTabs'
import ItemCard from '../components/ItemCard'
import Cart from '../components/Cart'

export default function POS() {
  const { categories, items, selectedCategoryId, fetchCategories, fetchItems, fetchAllItems } = useMenuStore()
  const increment = useCartStore(s => s.increment)
  const [toast, setToast] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const searchRef = useRef(null)

  useEffect(() => {
    fetchCategories()
  }, [])

  // Auto-focus search on mount
  useEffect(() => {
    const timer = setTimeout(() => searchRef.current?.focus(), 100)
    return () => clearTimeout(timer)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      // "/" to focus search (when not already in an input)
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        searchRef.current?.focus()
      }
      // Escape to clear search and blur
      if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        setSearchQuery('')
        searchRef.current?.blur()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const showToast = (msg, type = 'error') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }

  const handleCategorySelect = (catId) => {
    setSearchQuery('')
    fetchItems(catId)
  }

  const handleSelectAll = () => {
    setSearchQuery('')
    fetchAllItems()
  }

  // Filter active items by search query — instant, no debounce
  const activeItems = items
    .filter(i => i.is_active)
    .filter(i => {
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      const matchName = i.name.toLowerCase().includes(q)
      const cat = categories.find(c => c.id === i.category_id)
      const matchCat = cat?.name?.toLowerCase().includes(q)
      return matchName || matchCat
    })

  return (
    <div className="flex h-full overflow-hidden">
      {/* ═══════ Left: Product Browsing (70%) ═══════ */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ background: '#fff7ed' }}>
        {/* Category chips */}
        <CategoryTabs
          categories={categories}
          selectedId={selectedCategoryId}
          onSelect={handleCategorySelect}
          onSelectAll={handleSelectAll}
        />

        {/* Search bar — prominent */}
        <div className="px-4 pt-3 pb-2">
          <div className="pos-search">
            <span className="search-icon">🔍</span>
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search items…"
              autoComplete="off"
              spellCheck="false"
            />
            {searchQuery ? (
              <button
                onClick={() => { setSearchQuery(''); searchRef.current?.focus() }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-sm font-medium w-6 h-6 flex items-center justify-center rounded-full hover:bg-stone-100"
              >
                ✕
              </button>
            ) : (
              <span className="search-shortcut">/</span>
            )}
          </div>
        </div>

        {/* Item grid */}
        {activeItems.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl mb-2 opacity-40">{searchQuery ? '🔍' : '🍞'}</div>
              <p className="text-sm font-medium text-stone-500">
                {searchQuery ? 'No items match' : 'No items here'}
              </p>
              <p className="text-xs text-stone-400 mt-0.5">
                {searchQuery ? `Try different keywords` : 'Add items in Setup'}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 pb-3">
            <div className="grid grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2">
              {activeItems.map(item => (
                <ItemCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ═══════ Right: Bill Panel (30%) ═══════ */}
      <Cart
        onPrintSuccess={() => showToast('Bill printed!', 'success')}
        onPrintError={(e) => showToast(e ?? 'Print failed', 'error')}
      />

      {/* Toast — fast */}
      {toast && (
        <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl shadow-lg text-white text-sm font-medium z-50 toast-enter ${
          toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
