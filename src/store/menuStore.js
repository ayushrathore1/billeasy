import { create } from 'zustand'
import { call } from '../lib/tauri'

export const useMenuStore = create((set, get) => ({
  categories: [],
  items: [],
  selectedCategoryId: null,
  loading: false,

  fetchCategories: async () => {
    set({ loading: true })
    try {
      const categories = await call('get_categories')
      set({ categories, loading: false })
      // Auto-select first if none selected
      if (!get().selectedCategoryId && categories.length > 0) {
        await get().fetchItems(categories[0].id)
        set({ selectedCategoryId: categories[0].id })
      }
    } catch (e) {
      console.error('fetchCategories:', e)
      set({ loading: false })
    }
  },

  fetchItems: async (categoryId) => {
    try {
      const items = await call('get_items', { categoryId })
      set({ items, selectedCategoryId: categoryId })
    } catch (e) {
      console.error('fetchItems:', e)
    }
  },

  createCategory: async (name) => {
    const cat = await call('create_category', { name })
    await get().fetchCategories()
    set({ selectedCategoryId: cat.id })
    return cat
  },

  updateCategory: async (id, name, isActive, sortOrder) => {
    await call('update_category', { id, name, isActive, sortOrder })
    await get().fetchCategories()
  },

  deleteCategory: async (id) => {
    await call('delete_category', { id })
    set({ selectedCategoryId: null, items: [] })
    await get().fetchCategories()
  },

  createItem: async (categoryId, name, price) => {
    const item = await call('create_item', { categoryId, name, price })
    await get().fetchItems(categoryId)
    return item
  },

  updateItem: async (id, name, price, isActive) => {
    await call('update_item', { id, name, price, isActive })
    await get().fetchItems(get().selectedCategoryId)
  },

  deleteItem: async (id) => {
    await call('delete_item', { id })
    await get().fetchItems(get().selectedCategoryId)
  },
}))
