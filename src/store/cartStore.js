import { create } from 'zustand'

export const useCartStore = create((set, get) => ({
  quantities: {},  // { [itemId]: count }
  items: {},       // { [itemId]: { id, name, price } }

  increment: (item) => set(s => ({
    quantities: { ...s.quantities, [item.id]: (s.quantities[item.id] ?? 0) + 1 },
    items: { ...s.items, [item.id]: item },
  })),

  decrement: (itemId) => set(s => {
    const newQty = (s.quantities[itemId] ?? 0) - 1
    const q = { ...s.quantities }
    if (newQty <= 0) delete q[itemId]
    else q[itemId] = newQty
    return { quantities: q }
  }),

  clear: () => set({ quantities: {}, items: {} }),

  getCartItems: () => {
    const s = get()
    return Object.entries(s.quantities)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({
        ...s.items[Number(id)],
        qty,
        total: s.items[Number(id)].price * qty,
      }))
  },

  getTotal: () => {
    return get().getCartItems().reduce((sum, item) => sum + item.total, 0)
  },
}))
