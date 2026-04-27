import { API_URL } from '@/lib/api'
import { optionalDateString, optionalString, requireRecord, requireString } from '@/lib/api-contract'
import { fetchJSONWithAuth } from '@/lib/auth-fetch'

const BILLING_CONTRACT = 'billing payload'

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
    return fetchJSONWithAuth(`${API_URL}/billing/subscription`, accessToken).then(parseSubscription)
}

export function getCheckoutConfig(accessToken: string) {
    return fetchJSONWithAuth(`${API_URL}/billing/checkout-config`, accessToken).then(parseCheckoutConfig)
}

function parseSubscription(payload: unknown): Subscription {
    const subscription = requireRecord(payload, 'subscription response', BILLING_CONTRACT)

    return {
        plan: requireString(subscription.plan, 'plan', BILLING_CONTRACT),
        status: requireString(subscription.status, 'status', BILLING_CONTRACT),
        trial_ends_at: optionalDateString(subscription.trial_ends_at, 'trial_ends_at', BILLING_CONTRACT),
        current_period_ends_at: optionalDateString(subscription.current_period_ends_at, 'current_period_ends_at', BILLING_CONTRACT),
        paddle_customer_id: optionalString(subscription.paddle_customer_id, 'paddle_customer_id', BILLING_CONTRACT),
    }
}

function parseCheckoutConfig(payload: unknown): CheckoutConfig {
    const config = requireRecord(payload, 'checkout config response', BILLING_CONTRACT)

    return {
        client_token: requireString(config.client_token, 'client_token', BILLING_CONTRACT),
        price_id: requireString(config.price_id, 'price_id', BILLING_CONTRACT),
    }
}
