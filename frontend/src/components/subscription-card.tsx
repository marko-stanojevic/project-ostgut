'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { initializePaddle, type Paddle } from '@paddle/paddle-js'

interface Subscription {
  plan: string
  status: string
  trial_ends_at?: string
  current_period_ends_at?: string
  paddle_customer_id?: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

function daysUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

function planLabel(plan: string) {
  return plan === 'pro' ? 'Pro' : 'Free'
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'active': return 'default'
    case 'trialing': return 'secondary'
    case 'past_due': return 'destructive'
    case 'canceled':
    case 'paused': return 'outline'
    default: return 'secondary'
  }
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    trialing: 'Trial',
    active: 'Active',
    past_due: 'Past due',
    canceled: 'Canceled',
    paused: 'Paused',
  }
  return labels[status] ?? status
}

export function SubscriptionCard() {
  const { session, user } = useAuth()
  const [sub, setSub] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [paddle, setPaddle] = useState<Paddle | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

  // Load subscription
  useEffect(() => {
    if (!session?.accessToken) return
    fetch(`${apiUrl}/billing/subscription`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })
      .then((r) => r.json())
      .then((data) => setSub(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [session?.accessToken, apiUrl])

  // Initialize Paddle.js
  useEffect(() => {
    if (!session?.accessToken) return
    fetch(`${apiUrl}/billing/checkout-config`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })
      .then((r) => r.json())
      .then(async (cfg) => {
        if (!cfg.client_token || !cfg.price_id) return
        const p = await initializePaddle({
          token: cfg.client_token,
          environment: process.env.NEXT_PUBLIC_PADDLE_ENV === 'production' ? 'production' : 'sandbox',
        })
        if (p) setPaddle(p)
      })
      .catch(() => {})
  }, [session?.accessToken, apiUrl])

  const handleUpgrade = async () => {
    if (!paddle || !session?.accessToken) return
    setCheckoutLoading(true)

    try {
      // Fetch price_id from checkout-config
      const cfgRes = await fetch(`${apiUrl}/billing/checkout-config`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      })
      const cfg = await cfgRes.json()

      paddle.Checkout.open({
        items: [{ priceId: cfg.price_id, quantity: 1 }],
        customer: sub?.paddle_customer_id ? { id: sub.paddle_customer_id } : undefined,
        customData: { user_id: user?.id ?? '' },
      })
    } catch {
      // Silently fail — user can retry
    } finally {
      setCheckoutLoading(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subscription</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-16 animate-pulse bg-muted rounded-md" />
        </CardContent>
      </Card>
    )
  }

  if (!sub) return null

  const isTrialing = sub.status === 'trialing'
  const isPro = sub.plan === 'pro' && sub.status === 'active'
  const trialDays = sub.trial_ends_at ? daysUntil(sub.trial_ends_at) : 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Subscription</CardTitle>
          <Badge variant={statusVariant(sub.status)}>{statusLabel(sub.status)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{planLabel(sub.plan)} plan</p>
            {isTrialing && sub.trial_ends_at && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {trialDays > 0
                  ? `${trialDays} day${trialDays !== 1 ? 's' : ''} left in trial (ends ${formatDate(sub.trial_ends_at)})`
                  : 'Trial has ended'}
              </p>
            )}
            {isPro && sub.current_period_ends_at && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Renews {formatDate(sub.current_period_ends_at)}
              </p>
            )}
          </div>
        </div>

        {!isPro && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium">Upgrade to Pro</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>— Unlimited access to all features</li>
                <li>— Priority support</li>
                <li>— Early access to new features</li>
              </ul>
              <Button
                className="mt-2"
                onClick={handleUpgrade}
                disabled={checkoutLoading || !paddle}
              >
                {checkoutLoading ? 'Opening checkout…' : 'Upgrade to Pro'}
              </Button>
              {!paddle && (
                <p className="text-xs text-muted-foreground">
                  Billing not configured yet — add Paddle keys to enable checkout.
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
