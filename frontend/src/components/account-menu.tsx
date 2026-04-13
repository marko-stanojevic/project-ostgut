'use client'

import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { ChevronDown, LogOut, Moon, ShieldCheck, Sun } from 'lucide-react'
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

export function AccountMenu({ className }: AccountMenuProps) {
    const router = useRouter()
    const { resolvedTheme, setTheme } = useTheme()
    const { signOut } = useAuth()
    const { isAdmin } = useAdminStatus()

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <button
                        className={cn(
                            'inline-flex h-9 items-center gap-1.5 rounded-full border border-border/50 px-4 text-xs font-medium text-white transition-colors hover:bg-muted/40',
                            className
                        )}
                    />
                }
            >
                Account
                <ChevronDown className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => router.push('/settings')}>Settings</DropdownMenuItem>
                {isAdmin && (
                    <DropdownMenuItem onClick={() => router.push('/admin')}>
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Admin
                    </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
                    {resolvedTheme === 'dark' ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
                    Toggle Theme
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onClick={() => signOut().then(() => router.push('/'))}
                    className="text-destructive focus:text-destructive"
                >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
