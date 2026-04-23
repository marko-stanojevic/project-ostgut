'use client'

import { createContext, useContext } from 'react'

interface AdminSearchCtx {
  query: string
  setQuery: (q: string) => void
}

export const AdminSearchContext = createContext<AdminSearchCtx>({ query: '', setQuery: () => {} })

export function useAdminSearch() {
  return useContext(AdminSearchContext)
}
