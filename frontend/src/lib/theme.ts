export const themeOptions = [
  { value: 'light', labelKey: 'light' },
  { value: 'dark', labelKey: 'dark' },
  { value: 'sepia', labelKey: 'sepia' },
  { value: 'midnight', labelKey: 'midnight' },
] as const

export type AppTheme = (typeof themeOptions)[number]['value']

export const defaultTheme: AppTheme = 'light'
