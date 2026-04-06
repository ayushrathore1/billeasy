import { useCartStore } from '../store/cartStore'

export default function ItemCard({ item }) {
  const qty = useCartStore(s => s.quantities[item.id] ?? 0)
  const increment = useCartStore(s => s.increment)
  const decrement = useCartStore(s => s.decrement)

  const isActive = qty > 0

  return (
    <div
      className={`relative rounded-xl border-2 transition-all duration-150 cursor-pointer select-none flex flex-col items-center justify-between p-3 min-h-[120px] min-w-[140px] ${
        isActive
          ? 'border-brand-500 bg-brand-50 shadow-md'
          : 'border-gray-200 bg-white hover:border-brand-300 hover:shadow-sm'
      }`}
      onClick={() => !isActive && increment(item)}
    >
      {/* Qty badge */}
      {isActive && (
        <span className="absolute top-2 right-2 bg-brand-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
          {qty}
        </span>
      )}

      {/* Item info */}
      <div className="text-center flex-1 flex flex-col items-center justify-center w-full">
        <div className="font-semibold text-gray-800 text-sm leading-tight text-center line-clamp-2">
          {item.name}
        </div>
        <div className="text-brand-600 font-bold text-base mt-1">₹{item.price}</div>
      </div>

      {/* Qty stepper */}
      {isActive ? (
        <div
          className="flex items-center gap-2 mt-2"
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => decrement(item.id)}
            className="w-8 h-8 rounded-lg bg-white border border-gray-300 text-gray-700 font-bold text-lg flex items-center justify-center hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-colors"
          >
            −
          </button>
          <span className="text-gray-900 font-bold text-xl min-w-[24px] text-center">{qty}</span>
          <button
            onClick={() => increment(item)}
            className="w-8 h-8 rounded-lg bg-brand-500 text-white font-bold text-lg flex items-center justify-center hover:bg-brand-600 transition-colors"
          >
            +
          </button>
        </div>
      ) : (
        <button
          onClick={() => increment(item)}
          className="mt-2 w-8 h-8 rounded-lg bg-brand-500 text-white font-bold text-xl flex items-center justify-center hover:bg-brand-600 transition-colors"
        >
          +
        </button>
      )}
    </div>
  )
}
