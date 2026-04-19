export default function CategoryTabs({ categories, selectedId, onSelect, onSelectAll }) {
  if (categories.length === 0) {
    return (
      <div className="px-4 py-2.5 border-b border-stone-100 bg-white">
        <span className="text-sm text-stone-400">No categories — add in Setup</span>
      </div>
    )
  }

  const activeCategories = categories.filter(c => c.is_active)

  return (
    <div className="flex gap-1.5 overflow-x-auto px-4 py-2.5 bg-white border-b border-stone-100 scrollbar-thin">
      <button
        onClick={() => onSelectAll?.()}
        className={`category-pill ${selectedId === null ? 'active' : ''}`}
      >
        All
      </button>
      {activeCategories.map(cat => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          className={`category-pill ${selectedId === cat.id ? 'active' : ''}`}
        >
          {cat.name}
        </button>
      ))}
    </div>
  )
}
