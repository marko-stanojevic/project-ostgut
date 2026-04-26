/**
 * CarPlay shell — landscape, large hit targets, no header / no tab bar.
 *
 * The CarPlay surface is a sibling of `(protected)/`, not a child, so it
 * inherits the locale providers (auth, player, theme, intl) but does NOT
 * inherit the protected layout's chrome. Auth gating happens client-side
 * via `useAuth()` inside the page (cars hand back to the phone for login).
 *
 * Hit targets follow the iOS CarPlay HIG: minimum 44pt logical, but on the
 * 800×480 logical viewport we go larger (≥ 64px / ~4rem) so glanceable use
 * while driving stays safe. The carplay breakpoint (`carplay:`) targets
 * 50rem landscape.
 */
export default function CarPlayLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen bg-background text-foreground"
      style={{
        paddingTop: 'var(--safe-top)',
        paddingBottom: 'var(--safe-bottom)',
        paddingLeft: 'var(--safe-left)',
        paddingRight: 'var(--safe-right)',
      }}
    >
      {children}
    </div>
  )
}
