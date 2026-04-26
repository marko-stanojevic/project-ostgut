'use client'

import { Link } from '@/i18n/navigation'
import { AccountMenu } from '@/components/account-menu'
import { Button } from '@/components/ui/button'

export function AuthenticatedHeaderActions() {
    return (
        <>
            <Button
                variant="outline"
                size="sm"
                render={<Link href="/pricing" />}
                className="hidden rounded-full sm:inline-flex"
            >
                Upgrade
            </Button>
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
            <Button
                variant="ghost"
                size="sm"
                render={<Link href="/auth/login" />}
                className="text-muted-foreground hover:text-foreground"
            >
                Login
            </Button>
            <Button
                size="sm"
                render={<Link href="/auth/signup" />}
                className="rounded-full px-4"
            >
                {signUpLabel}
            </Button>
        </>
    )
}
