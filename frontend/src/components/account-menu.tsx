'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import {
    SignOut,
    Moon,
    Sun,
    ShieldCheck,
    Gear,
    ArrowsLeftRight,
    User,
    Lock,
    Bell,
    Palette,
} from '@phosphor-icons/react'
import { useAuth } from '@/context/AuthContext'
import { useAdminStatus } from '@/hooks/useAdminStatus'
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

export function AccountMenu({ className }: AccountMenuProps) {
    const router = useRouter()
    const { resolvedTheme, setTheme } = useTheme()
    const { user, signOut } = useAuth()
    const { isAdmin } = useAdminStatus()

    const isDark = resolvedTheme === 'dark'

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
                <Avatar name={user?.name} image={user?.image} />
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-56 p-0 overflow-hidden">

                {/* Profile header */}
                <div className="flex items-center gap-3 px-3 py-3 border-b border-border/60">
                    <Avatar name={user?.name} image={user?.image} size={36} />
                    <div className="min-w-0">
                        {user?.name && <p className="text-sm font-medium truncate">{user.name}</p>}
                        {user?.email && <p className="text-xs text-muted-foreground truncate">{user.email}</p>}
                    </div>
                    <ArrowsLeftRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </div>

                {/* Main actions */}
                <div className="py-1">
                    <DropdownMenuItem onClick={() => router.push('/settings?section=profile')} className="gap-2.5 px-3 py-2 text-sm">
                        <User className="h-4 w-4 text-muted-foreground" />
                        Profile
                    </DropdownMenuItem>
                    {isAdmin && (
                        <DropdownMenuItem onClick={() => router.push('/admin')} className="gap-2.5 px-3 py-2 text-sm">
                            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                            Admin
                        </DropdownMenuItem>
                    )}
                </div>

                <DropdownMenuSeparator className="my-0" />

                {/* Settings group */}
                <div className="py-1">
                    <DropdownMenuItem onClick={() => router.push('/settings')} className="gap-2.5 px-3 py-2 text-sm">
                        <Gear className="h-4 w-4 text-muted-foreground" />
                        Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/settings?section=security')} className="gap-2.5 px-3 py-2 text-sm">
                        <Lock className="h-4 w-4 text-muted-foreground" />
                        Security
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/settings?section=notifications')} className="gap-2.5 px-3 py-2 text-sm">
                        <Bell className="h-4 w-4 text-muted-foreground" />
                        Notifications
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/settings?section=preferences')} className="gap-2.5 px-3 py-2 text-sm">
                        <Palette className="h-4 w-4 text-muted-foreground" />
                        Preferences
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => setTheme(isDark ? 'light' : 'dark')}
                        className="gap-2.5 px-3 py-2 text-sm"
                    >
                        {isDark
                            ? <Sun className="h-4 w-4 text-muted-foreground" />
                            : <Moon className="h-4 w-4 text-muted-foreground" />
                        }
                        Appearance
                    </DropdownMenuItem>
                </div>

                <DropdownMenuSeparator className="my-0" />

                {/* Sign out */}
                <div className="py-1">
                    <DropdownMenuItem
                        onClick={() => signOut().then(() => router.push('/'))}
                        className="gap-2.5 px-3 py-2 text-sm text-muted-foreground"
                    >
                        <SignOut className="h-4 w-4" />
                        Sign out
                    </DropdownMenuItem>
                </div>

            </DropdownMenuContent>
        </DropdownMenu>
    )
}
