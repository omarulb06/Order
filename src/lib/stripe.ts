// ---------------------------------------------------------------------------
// Stripe integration — intentionally modular.
//
// Cash-on-delivery is the default payment method; card / Apple Pay / Google
// Pay can be toggled on from the Owner settings screen later. When toggled
// on, the StripeProvider in app/_layout.tsx will wrap the tree with the
// publishable key supplied via EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY, and the
// checkout screen can call `presentStripeSheet` below.
//
// This file is wire-ready but will NOT attempt any network calls until a
// backend endpoint returning a PaymentIntent client_secret is deployed —
// see createPaymentIntent for the expected contract.
// ---------------------------------------------------------------------------

import { Alert } from 'react-native';

export const stripePublishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

export const isStripeConfigured = (): boolean => {
  return stripePublishableKey.startsWith('pk_');
};

export interface CreatePaymentIntentArgs {
  amount: number; // in major units (e.g. dollars)
  currency: string; // iso-4217, lowercase (e.g. 'usd')
  orderId: string;
}

export interface PaymentIntentResponse {
  clientSecret: string;
  ephemeralKey?: string;
  customer?: string;
}

/**
 * Placeholder for your backend endpoint. In production, this should hit a
 * Supabase Edge Function or your own server to:
 *   1. verify the order total server-side,
 *   2. create a Stripe PaymentIntent with the matching amount & currency,
 *   3. return the client_secret.
 *
 * Replace the body of this function with a fetch to that endpoint.
 */
export async function createPaymentIntent(
  _args: CreatePaymentIntentArgs
): Promise<PaymentIntentResponse> {
  throw new Error(
    '[stripe] createPaymentIntent is a stub. Deploy a Supabase Edge Function ' +
      'at /payments/intent that creates a Stripe PaymentIntent and returns ' +
      '{ clientSecret, ephemeralKey?, customer? }.'
  );
}

/**
 * Lazy-loaded wrapper around @stripe/stripe-react-native so cash-only
 * installs don't need to bundle the native module at runtime.
 */
export async function presentStripeSheet(args: CreatePaymentIntentArgs): Promise<
  | { status: 'succeeded' }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string }
> {
  if (!isStripeConfigured()) {
    Alert.alert(
      'Stripe not configured',
      'Set EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY in your .env to enable card payments.'
    );
    return { status: 'failed', message: 'Stripe not configured' };
  }

  try {
    const stripe = await import('@stripe/stripe-react-native');
    const intent = await createPaymentIntent(args);

    const init = await stripe.initPaymentSheet({
      merchantDisplayName: 'Order',
      paymentIntentClientSecret: intent.clientSecret,
      customerId: intent.customer,
      customerEphemeralKeySecret: intent.ephemeralKey,
      allowsDelayedPaymentMethods: false,
    });
    if (init.error) return { status: 'failed', message: init.error.message };

    const result = await stripe.presentPaymentSheet();
    if (result.error) {
      if (result.error.code === 'Canceled') return { status: 'cancelled' };
      return { status: 'failed', message: result.error.message };
    }
    return { status: 'succeeded' };
  } catch (err: any) {
    return { status: 'failed', message: err?.message ?? 'Unknown Stripe error' };
  }
}
