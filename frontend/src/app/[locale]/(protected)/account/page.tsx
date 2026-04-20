import { redirect } from '@/i18n/navigation'
import { getLocale } from 'next-intl/server'

export default async function AccountPage() {
  const locale = await getLocale()
  redirect({ href: '/settings', locale })
}
