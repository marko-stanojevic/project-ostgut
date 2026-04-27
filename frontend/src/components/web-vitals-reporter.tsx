'use client'

import { useReportWebVitals } from 'next/web-vitals'

type ReportWebVitalsCallback = Parameters<typeof useReportWebVitals>[0]

declare global {
  interface Window {
    newrelic?: {
      addPageAction?: (name: string, attributes?: Record<string, unknown>) => void
    }
  }
}

export function WebVitalsReporter() {
  useReportWebVitals(reportWebVital)

  return null
}

const reportWebVital: ReportWebVitalsCallback = (metric) => {
  window.newrelic?.addPageAction?.('web_vital', {
    id: metric.id,
    name: metric.name,
    value: metric.value,
    delta: metric.delta,
    rating: metric.rating,
    navigationType: metric.navigationType,
    pathname: window.location.pathname,
  })
}
