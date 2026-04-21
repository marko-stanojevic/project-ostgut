import { NewRelicAgent } from "@/components/NewRelicAgent"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <NewRelicAgent />
        {children}
      </body>
    </html>
  )
}
