import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['en', 'de', 'es', 'it', 'nl', 'da'],
  defaultLocale: 'en',
})
