import { useCartStore } from '../store/cartStore'
import { useCloudinaryStore } from '../store/cloudinaryStore'

export default function ItemCard({ item }) {
  const qty = useCartStore(s => s.quantities[item.id] ?? 0)
  const increment = useCartStore(s => s.increment)
  const decrement = useCartStore(s => s.decrement)
  const getThumbnail = useCloudinaryStore(s => s.getThumbnail)

  const isActive = qty > 0
  const thumbUrl = item.image_url ? getThumbnail(item.image_url, 160, 160) : null

  return (
    <div
      className={`item-card ${isActive ? 'active' : ''}`}
      onClick={() => increment(item)}
    >
      {/* Qty badge — top right */}
      {isActive && (
        <span className="qty-badge absolute -top-1.5 -right-1.5 bg-orange-500 text-white text-[11px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-md z-10">
          {qty}
        </span>
      )}

      {/* Image or emoji fallback */}
      {thumbUrl ? (
        <div className="w-11 h-11 rounded-lg overflow-hidden bg-stone-50 mb-1 flex-shrink-0">
          <img src={thumbUrl} alt="" className="w-full h-full object-cover" loading="lazy" onError={e => e.target.style.display='none'} />
        </div>
      ) : (
        <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center mb-1 flex-shrink-0">
          <span className="text-sm">🍞</span>
        </div>
      )}

      {/* Name — 1 line, truncated */}
      <div className="font-heading font-semibold text-stone-800 text-[13px] leading-tight text-center truncate w-full px-1">
        {item.name}
      </div>

      {/* Price — bold, mono */}
      <div className="font-mono font-bold text-orange-600 text-sm">₹{item.price}</div>

      {/* Stepper or Add button */}
      {isActive ? (
        <div className="flex items-center gap-1.5 mt-1" onClick={e => e.stopPropagation()}>
          <button onClick={() => decrement(item.id)} className="add-btn minus sm">−</button>
          <span className="font-mono font-bold text-stone-800 text-sm min-w-[18px] text-center">{qty}</span>
          <button onClick={() => increment(item)} className="add-btn sm">+</button>
        </div>
      ) : (
        <button className="add-btn mt-1" onClick={(e) => { e.stopPropagation(); increment(item) }}>+</button>
      )}
    </div>
  )
}
