import { Link } from '@/i18n/navigation'

type FooterLink = {
    href: string
    label: string
}

type SiteFooterProps = {
    links: FooterLink[]
}

export function SiteFooter({ links }: SiteFooterProps) {
    return (
        <footer className="border-t border-border/40">
            <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-6 py-6 text-sm text-muted-foreground sm:flex-row">
                <span>&copy; {new Date().getFullYear()} bougie.fm. All rights reserved.</span>
                <nav className="flex gap-4">
                    {links.map((link) => (
                        <Link key={link.href} href={link.href} className="transition-colors hover:text-foreground">
                            {link.label}
                        </Link>
                    ))}
                </nav>
            </div>
        </footer>
    )
}
