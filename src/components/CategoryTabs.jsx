export default function CategoryTabs({ categories, selectedId, onSelect }) {
  if (categories.length === 0) {
    return (
      <div className="px-4 py-3 border-b border-gray-200 bg-white">
        <span className="text-sm text-gray-400">No categories yet — add them in Setup</span>
      </div>
    )
  }

  return (
    <div className="flex gap-1 overflow-x-auto px-4 py-2 bg-white border-b border-gray-200 scrollbar-thin">
      {categories.map(cat => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          className={`whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${
            selectedId === cat.id
              ? 'bg-brand-500 text-white shadow-sm'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {cat.name}
        </button>
      ))}
    </div>
  )
}
