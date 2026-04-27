import { API_URL } from '@/lib/api'
import { fetchJSONWithAuth } from '@/lib/auth-fetch'

export interface Subscription {
    plan: string
    status: string
    trial_ends_at?: string
    current_period_ends_at?: string
    paddle_customer_id?: string
}

export interface CheckoutConfig {
    client_token?: string
    price_id?: string
}

export function getSubscription(accessToken: string) {
    return fetchJSONWithAuth<Subscription>(`${API_URL}/billing/subscription`, accessToken)
}

export function getCheckoutConfig(accessToken: string) {
    return fetchJSONWithAuth<CheckoutConfig>(`${API_URL}/billing/checkout-config`, accessToken)
}
