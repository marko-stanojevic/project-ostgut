'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import {
    SignOutIcon,
    ShieldCheckIcon,
    RadioIcon,
    GearIcon,
    ArrowsLeftRightIcon,
    UserIcon,
    LockIcon,
    BellIcon,
    PaletteIcon,
} from '@phosphor-icons/react'
import { useAuth } from '@/context/AuthContext'
import { getPreferredMediaUrl } from '@/lib/media'
import { getUserProfile } from '@/lib/user-profile'
import { cn } from '@/lib/utils'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface AccountMenuProps {
    className?: string
    avatarSize?: number
}

function Avatar({ name, image, size = 32 }: { name?: string | null; image?: string | null; size?: number }) {
    if (image) {
        return (
            <Image
                src={image}
                alt={name ?? 'Account'}
                width={size}
                height={size}
                className="rounded-full object-cover"
                style={{ width: size, height: size }}
                unoptimized
            />
        )
    }

    const initials = name
        ? name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
        : '?'

    return (
        <span
            className="flex items-center justify-center rounded-full bg-foreground text-xs font-medium text-background"
            style={{ width: size, height: size }}
        >
            {initials}
        </span>
    )
}

export function AccountMenu({ className, avatarSize = 32 }: AccountMenuProps) {
    const router = useRouter()
    const { user, session, signOut, isAdmin, isEditor } = useAuth()
    const [mounted, setMounted] = useState(false)
    const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.image ?? null)
    const t = useTranslations('account_menu')

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        if (!session?.accessToken) {
            return
        }

        let active = true

        getUserProfile(session.accessToken, {
            cache: 'no-store',
        })
            .then((data) => {
                if (!active) return
                setAvatarUrl(getPreferredMediaUrl(data.avatar) ?? user?.image ?? null)
            })
            .catch(() => {
                if (!active) return
                setAvatarUrl(user?.image ?? null)
            })

        return () => {
            active = false
        }
    }, [session?.accessToken, user?.image])

    if (!mounted) {
        return (
            <span
                className={cn(
                    'inline-flex rounded-full outline-none ring-offset-2 transition-opacity',
                    className
                )}
                aria-label="Account"
            >
                <Avatar name={user?.name} image={avatarUrl} size={avatarSize} />
            </span>
        )
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <button
                        className={cn(
                            'rounded-full outline-none ring-offset-2 transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring',
                            className
                        )}
                        aria-label="Account menu"
                    />
                }
            >
                <Avatar name={user?.name} image={avatarUrl} size={avatarSize} />
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-56 p-0 overflow-hidden">

                {/* Profile header */}
                <div className="flex items-center gap-3 px-3 py-3 border-b border-border/60">
                    <Avatar name={user?.name} image={avatarUrl} size={36} />
                    <div className="min-w-0">
                        {user?.name && <p className="text-sm font-medium truncate">{user.name}</p>}
                        {user?.email && <p className="text-xs text-muted-foreground truncate">{user.email}</p>}
                    </div>
                    <ArrowsLeftRightIcon className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </div>

                {/* Main actions */}
                <div className="py-1">
                    <DropdownMenuItem onClick={() => router.push('/settings?section=profile')} className="gap-2.5 px-3 py-2 text-sm">
                        <UserIcon className="h-4 w-4 text-muted-foreground" />
                        {t('profile')}
                    </DropdownMenuItem>
                    {isEditor && (
                        <DropdownMenuItem onClick={() => router.push('/editor/stations')} className="gap-2.5 px-3 py-2 text-sm">
                            <RadioIcon className="h-4 w-4 text-muted-foreground" />
                            {t('editor')}
                        </DropdownMenuItem>
                    )}
                    {isAdmin && (
                        <DropdownMenuItem onClick={() => router.push('/admin')} className="gap-2.5 px-3 py-2 text-sm">
                            <ShieldCheckIcon className="h-4 w-4 text-muted-foreground" />
                            {t('admin')}
                        </DropdownMenuItem>
                    )}
                </div>

                <DropdownMenuSeparator className="my-0" />

                {/* Settings group */}
                <div className="py-1">
                    <DropdownMenuItem onClick={() => router.push('/settings')} className="gap-2.5 px-3 py-2 text-sm">
                        <GearIcon className="h-4 w-4 text-muted-foreground" />
                        {t('settings')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/settings?section=security')} className="gap-2.5 px-3 py-2 text-sm">
                        <LockIcon className="h-4 w-4 text-muted-foreground" />
                        {t('security')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/settings?section=notifications')} className="gap-2.5 px-3 py-2 text-sm">
                        <BellIcon className="h-4 w-4 text-muted-foreground" />
                        {t('notifications')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/settings?section=preferences')} className="gap-2.5 px-3 py-2 text-sm">
                        <PaletteIcon className="h-4 w-4 text-muted-foreground" />
                        {t('preferences')}
                    </DropdownMenuItem>
                </div>

                <DropdownMenuSeparator className="my-0" />

                {/* Sign out */}
                <div className="py-1">
                    <DropdownMenuItem
                        onClick={() => signOut().then(() => router.push('/'))}
                        className="gap-2.5 px-3 py-2 text-sm text-muted-foreground"
                    >
                        <SignOutIcon className="h-4 w-4" />
                        {t('sign_out')}
                    </DropdownMenuItem>
                </div>

            </DropdownMenuContent>
        </DropdownMenu>
    )
}
