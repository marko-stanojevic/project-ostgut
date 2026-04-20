import { MicrophoneIcon } from '@phosphor-icons/react/dist/ssr'
import { getTranslations } from 'next-intl/server'

export default async function ShowsPage() {
  const tNav = await getTranslations('nav')
  const t = await getTranslations()

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col">
      <div className="rounded-xl border border-border/60 bg-card/50 px-6 py-16 text-center sm:px-10 sm:py-24">
        <MicrophoneIcon className="mx-auto mb-4 h-10 w-10 text-muted-foreground/40 sm:h-12 sm:w-12" />
        <h1 className="ui-page-title">{tNav('shows')}</h1>
        <p className="ui-page-subtitle">{t('coming_soon')}</p>
      </div>
    </div>
  )
}
