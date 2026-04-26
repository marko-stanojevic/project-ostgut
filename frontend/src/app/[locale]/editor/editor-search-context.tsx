'use client'

import { createContext, useContext } from 'react'

interface EditorSearchCtx {
  query: string
  setQuery: (q: string) => void
}

export const EditorSearchContext = createContext<EditorSearchCtx>({ query: '', setQuery: () => {} })

export function useEditorSearch() {
  return useContext(EditorSearchContext)
}
