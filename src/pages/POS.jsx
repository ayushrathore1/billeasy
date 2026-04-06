import { useEffect, useState } from 'react'
import { useMenuStore } from '../store/menuStore'
import { useCartStore } from '../store/cartStore'
import CategoryTabs from '../components/CategoryTabs'
import ItemCard from '../components/ItemCard'
import Cart from '../components/Cart'

export default function POS() {
  const { categories, items, selectedCategoryId, fetchCategories, fetchItems } = useMenuStore()
  const [toast, setToast] = useState(null)

  useEffect(() => {
    fetchCategories()
  }, [])

  const showToast = (msg, type = 'error') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const activeItems = items.filter(i => i.is_active)

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Category + Items */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <CategoryTabs
          categories={categories}
          selectedId={selectedCategoryId}
          onSelect={fetchItems}
        />

        {activeItems.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <div className="text-5xl mb-3">🍽️</div>
              <p className="text-lg font-medium">No items in this category</p>
              <p className="text-sm mt-1">Add items from the Setup screen</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
              {activeItems.map(item => (
                <ItemCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: Cart */}
      <Cart onPrintSuccess={() => showToast('Bill printed!', 'success')}
            onPrintError={(e) => showToast(e ?? 'Print failed — check printer')} />

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium z-50 toast-enter ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
