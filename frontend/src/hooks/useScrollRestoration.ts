'use client'

import { useEffect } from 'react'

interface UseScrollRestorationOptions {
    pathname: string
    search: string
    returnKey: string
    scrollKey: string
    ready?: boolean
}

export function useScrollRestoration({
    pathname,
    search,
    returnKey,
    scrollKey,
    ready = true,
}: UseScrollRestorationOptions) {
    useEffect(() => {
        if (!ready || typeof window === 'undefined') return

        const savedReturn = sessionStorage.getItem(returnKey)
        const savedScrollY = sessionStorage.getItem(scrollKey)
        const current = search ? `${pathname}?${search}` : pathname

        if (!savedReturn || !savedScrollY || savedReturn !== current) return

        const y = Number(savedScrollY)
        if (!Number.isFinite(y)) return

        const rafID = window.requestAnimationFrame(() => {
            window.scrollTo({ top: y, behavior: 'auto' })
            sessionStorage.removeItem(returnKey)
            sessionStorage.removeItem(scrollKey)
        })

        return () => window.cancelAnimationFrame(rafID)
    }, [pathname, ready, returnKey, scrollKey, search])
}
