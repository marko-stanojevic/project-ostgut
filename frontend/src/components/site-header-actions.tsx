import Link from 'next/link'

import { AccountMenu } from '@/components/account-menu'

export function AuthenticatedHeaderActions() {
    return (
        <>
            <Link
                href="/pricing"
                className="hidden rounded-full border border-border/60 bg-background/70 px-3 py-2 text-xs font-medium tracking-tight text-foreground transition-colors hover:bg-secondary/60 sm:block"
            >
                Upgrade
            </Link>
            <AccountMenu />
        </>
    )
}

type GuestHeaderActionsProps = {
    signUpLabel?: string
}

export function GuestHeaderActions({
    signUpLabel = 'Sign Up',
}: GuestHeaderActionsProps) {
    return (
        <>
            <Link href="/auth/login" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                Login
            </Link>
            <Link
                href="/auth/signup"
                className="rounded-full bg-primary px-5 py-2 text-sm font-medium tracking-tight text-primary-foreground transition-colors hover:bg-primary/90"
            >
                {signUpLabel}
            </Link>
        </>
    )
}