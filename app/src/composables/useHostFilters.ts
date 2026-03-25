import { computed, ref, type Ref } from 'vue'

type NotifyFn = (ok: boolean, message: string) => void

export function useHostFilters(params: {
  hostItems: Ref<any[]>
  extraCategories: Ref<string[]>
  defaultCategory: string
  allCategory: string
  notify: NotifyFn
  refreshHosts: () => Promise<void>
}) {
  const { hostItems, extraCategories, defaultCategory, allCategory, notify, refreshHosts } = params

  const selectedCategory = ref(allCategory)
  const hostKeyword = ref('')
  const newCategoryName = ref('')
  const newCategoryInputVisible = ref(false)
  const editingCategory = ref('')
  const editingCategoryName = ref('')

  const hostCategories = computed(() => {
    const set = new Set<string>([defaultCategory])
    hostItems.value.forEach((h) => set.add(h.category || defaultCategory))
    extraCategories.value.forEach((c) => set.add(c))
    return Array.from(set)
  })

  const displayCategories = computed(() => [allCategory, ...hostCategories.value])

  const filteredHosts = computed(() => {
    const keyword = hostKeyword.value.trim().toLowerCase()
    return hostItems.value.filter((h) => {
      const categoryName = h.category || defaultCategory
      const inCategory = selectedCategory.value === allCategory || categoryName === selectedCategory.value
      if (!inCategory) return false
      if (!keyword) return true
      return [h.name, h.host, h.username, h.category].some((v) => String(v || '').toLowerCase().includes(keyword))
    })
  })

  const persistExtraCategories = async () => {
    const res = await window.lightterm.hostsSetCategories({
      extraCategories: extraCategories.value.filter((category) => category && category !== defaultCategory && category !== allCategory),
    })
    if (res.ok) {
      extraCategories.value = Array.isArray(res.extraCategories) ? res.extraCategories : []
      return true
    }
    notify(false, `分类保存失败：${res.error || '未知错误'}`)
    return false
  }

  const beginAddCategory = () => {
    editingCategory.value = ''
    editingCategoryName.value = ''
    newCategoryInputVisible.value = true
    newCategoryName.value = ''
  }

  const beginRenameCategory = (from: string) => {
    if (!from || from === defaultCategory || from === allCategory) return
    newCategoryInputVisible.value = false
    editingCategory.value = from
    editingCategoryName.value = from
  }

  const cancelRenameCategory = () => {
    editingCategory.value = ''
    editingCategoryName.value = ''
  }

  const addCategory = async () => {
    const name = newCategoryName.value.trim()
    if (!name) {
      newCategoryInputVisible.value = false
      return
    }
    if (name === allCategory || name === defaultCategory) {
      notify(false, `分类名不能使用“${name}”`)
      return
    }
    if (!extraCategories.value.includes(name) && !hostCategories.value.includes(name)) {
      extraCategories.value = [...extraCategories.value, name]
      const ok = await persistExtraCategories()
      if (!ok) return
    }
    selectedCategory.value = name
    newCategoryName.value = ''
    newCategoryInputVisible.value = false
    notify(true, `分类已新建：${name}`)
  }

  const renameCategoryInline = async (from = editingCategory.value) => {
    if (from === defaultCategory || from === allCategory) return
    const to = editingCategory.value === from
      ? editingCategoryName.value.trim()
      : ''
    if (!to || to === from) {
      cancelRenameCategory()
      return
    }
    if (to === allCategory || to === defaultCategory) {
      notify(false, `分类名不能使用“${to}”`)
      return
    }

    extraCategories.value = [...new Set(extraCategories.value.map((c) => (c === from ? to : c)).concat(to))]

    const targets = hostItems.value.filter((h) => (h.category || defaultCategory) === from)
    for (const h of targets) {
      await window.lightterm.hostsSave({
        id: h.id,
        name: h.name,
        host: h.host,
        port: h.port,
        username: h.username,
        password: h.password || '',
        category: to,
        authType: h.auth_type || 'password',
        privateKeyRef: h.private_key_ref || null,
        purchaseDate: h.purchaseDate || h.purchase_date || '',
        expiryDate: h.expiryDate || h.expiry_date || '',
      })
    }
    const categorySaved = await persistExtraCategories()
    if (!categorySaved) return
    cancelRenameCategory()
    selectedCategory.value = to
    await refreshHosts()
    notify(true, `分类已重命名：${from} → ${to}`)
  }

  const deleteCategoryInline = async (category: string) => {
    if (!category || category === defaultCategory || category === allCategory) return
    const ok = window.confirm(`删除分类“${category}”？该分类下的主机会自动迁移到“${defaultCategory}”。`)
    if (!ok) return

    const targets = hostItems.value.filter((h) => (h.category || defaultCategory) === category)
    for (const h of targets) {
      const res = await window.lightterm.hostsSave({
        id: h.id,
        name: h.name,
        host: h.host,
        port: h.port,
        username: h.username,
        password: h.password || '',
        category: defaultCategory,
        authType: h.auth_type || 'password',
        privateKeyRef: h.private_key_ref || null,
        purchaseDate: h.purchaseDate || h.purchase_date || '',
        expiryDate: h.expiryDate || h.expiry_date || '',
      })
      if (!res.ok) {
        notify(false, `分类删除失败：${res.error || '主机迁移失败'}`)
        return
      }
    }

    extraCategories.value = extraCategories.value.filter((item) => item !== category)
    const categorySaved = await persistExtraCategories()
    if (!categorySaved) return

    if (selectedCategory.value === category) selectedCategory.value = defaultCategory
    await refreshHosts()
    notify(true, `分类已删除：${category}`)
  }

  return {
    selectedCategory,
    hostKeyword,
    newCategoryName,
    newCategoryInputVisible,
    hostCategories,
    displayCategories,
    filteredHosts,
    editingCategory,
    editingCategoryName,
    beginAddCategory,
    addCategory,
    beginRenameCategory,
    cancelRenameCategory,
    renameCategoryInline,
    deleteCategoryInline,
  }
}
