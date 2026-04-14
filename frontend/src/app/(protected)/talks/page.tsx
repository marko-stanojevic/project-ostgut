import { Chat } from '@phosphor-icons/react/dist/ssr'

export default function TalksPage() {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <Chat className="h-10 w-10 text-muted-foreground/40 mb-4" />
      <h1 className="text-xl font-medium tracking-tight">Talks</h1>
      <p className="mt-2 text-sm text-muted-foreground">Coming soon.</p>
    </div>
  )
}
