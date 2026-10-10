import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth';
import { useCartStore } from '@/stores/cart';
import { useSettingsStore } from '@/stores/settings';
import { formatCurrency } from '@/lib/format';
import { isValidE164, normalizeE164, validateCheckout } from '@/lib/validation';
import { computeOrderTotals, validateCartStock } from '@/lib/pricing';
import { assertSubmittable, isStoreAcceptingOrders, OrderGuardError } from '@/lib/orderGuards';
import { StoreClosedError } from '@/lib/storeHours';
import {
  buildCheckoutFormFromProfile,
  filterRequiredFieldsForFulfillment,
} from '@/lib/profileForm';
import { isStripeConfigured, presentStripeSheet } from '@/lib/stripe';
import { useRecentOrderStore } from '@/stores/recentOrder';
import { placeOrder } from '@/lib/firestore/orders';
import type {
  Address,
  FulfillmentType,
  PaymentMethod,
} from '@/types/database';

const FIELD_LABELS: Record<string, string> = {
  full_name: 'Full name',
  phone_number: 'Phone (E.164, e.g. +15555550123)',
  email: 'Email',
  address_line1: 'Address line 1',
  address_line2: 'Address line 2',
  street_name: 'Street name',
  city: 'City',
  state: 'State / Region',
  postal_code: 'Postal code',
  country: 'Country',
  notes: 'Order notes',
};

type FormState = Record<string, string>;

export default function CheckoutScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const settings = useSettingsStore((s) => s.settings);
  const lines = useCartStore((s) => s.lines);
  const clearCart = useCartStore((s) => s.clear);

  const [fulfillment, setFulfillment] = useState<FulfillmentType>('delivery');
  const [payment, setPayment] = useState<PaymentMethod>('cash');
  const [form, setForm] = useState<FormState>({});
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const requiredFields = settings?.requiredCheckoutFields ?? [
    'full_name',
    'phone_number',
    'address_line1',
    'city',
  ];
  const activePayments = settings?.paymentMethods ?? { cash: true, stripe: false };

  // Auto-fill from profile on mount if authenticated.
  useEffect(() => {
    if (!profile) return;
    setForm((prev) => ({ ...prev, ...buildCheckoutFormFromProfile(profile, prev) }));
  }, [profile]);

  const activeRequiredFields = useMemo(
    () => filterRequiredFieldsForFulfillment(requiredFields, fulfillment),
    [fulfillment, requiredFields]
  );

  const { subtotal, deliveryFee, total } = computeOrderTotals(lines, settings, fulfillment);
  const storeAccepting = isStoreAcceptingOrders(settings);

  const paymentOptions: { key: PaymentMethod; label: string; icon: any }[] = (
    [
      { key: 'cash',   label: 'Cash on delivery', icon: 'cash-outline' },
      { key: 'stripe', label: 'Card (Stripe)',    icon: 'card-outline' },
    ] as const
  )
    .filter((o) => activePayments[o.key])
    .map((o) => ({ key: o.key, label: o.label, icon: o.icon }));

  const setField = (k: string, v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const submit = async () => {
    const validationErrors = validateCheckout(form, activeRequiredFields);
    if (validationErrors.length > 0) {
      const errMap: Record<string, string> = {};
      for (const e of validationErrors) errMap[e.field] = e.message;
      setErrors(errMap);
      return;
    }
    setErrors({});

    const normalizedPhone = normalizeE164(form.phone_number ?? '');
    if (!normalizedPhone || !isValidE164(normalizedPhone)) {
      setErrors({ phone_number: 'Phone must be E.164 (e.g. +15555550123).' });
      return;
    }

    if (lines.length === 0) {
      Alert.alert('Your cart is empty.');
      return;
    }

    const stockViolations = validateCartStock(lines);
    if (stockViolations.length > 0) {
      const names = stockViolations
        .map((v) => lines.find((l) => l.product.id === v.productId)?.product.name ?? v.productId)
        .join(', ');
      Alert.alert('Stock problem', `These items can't be ordered right now: ${names}`);
      return;
    }

    // Client-side pre-flight (DB-side mirror runs inside the Firestore
    // transaction).
    try {
      assertSubmittable({
        settings,
        fulfillment,
        payment,
        lines,
        subtotal,
        total,
        deliveryFee,
      });
    } catch (e) {
      Alert.alert(
        e instanceof StoreClosedError ? 'Store closed' : 'Cannot place order',
        (e as Error).message
      );
      return;
    }

    setSubmitting(true);
    try {
      const address: Address | null =
        fulfillment === 'delivery'
          ? {
              addressLine1: form.address_line1 ?? '',
              addressLine2: form.address_line2 || undefined,
              streetName:   form.street_name   || undefined,
              city:         form.city ?? '',
              state:        form.state         || undefined,
              postalCode:   form.postal_code   || undefined,
              country:      form.country       || undefined,
              notes:        form.notes         || undefined,
            }
          : null;

      const { order, items } = await placeOrder({
        userId: user?.uid ?? null,
        customerName: form.full_name ?? '',
        phoneNumber: normalizedPhone,
        deliveryAddress: address,
        fulfillmentType: fulfillment,
        paymentMethod: payment,
        notes: form.notes || null,
        lines: lines.map((l) => ({
          productId: l.product.id,
          productName: l.product.name,
          quantity: l.quantity,
          unitPrice: l.product.price,
        })),
      });

      // Optional Stripe up-sell for the stripe method.
      if (payment === 'stripe' && isStripeConfigured()) {
        const result = await presentStripeSheet({
          amount: order.totalAmount,
          currency: 'usd',
          orderId: order.id,
        });
        if (result.status === 'failed') {
          Alert.alert('Payment failed', result.message);
          return;
        }
        if (result.status === 'cancelled') {
          return;
        }
      }

      // Cache for the confirmation screen (works even for guests, who
      // cannot read orders back from Firestore per firestore.rules).
      useRecentOrderStore.getState().setLastOrder(order, items);

      clearCart();
      router.replace({
        pathname: '/order-confirmation',
        params: { orderId: order.id },
      } as any);
    } catch (err: any) {
      Alert.alert(
        'Could not place order',
        err instanceof OrderGuardError ? err.message : err?.message ?? 'Unknown error'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-white dark:bg-neutral-950"
    >
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 180 }}>
        {!storeAccepting && (
          <View className="mb-4 rounded-xl bg-rose-50 border border-rose-200 p-3 flex-row items-center">
            <Ionicons name="time-outline" size={20} color="#be123c" />
            <Text className="ml-2 flex-1 text-sm text-rose-700 font-medium">
              {t('checkout.storeClosed')}
            </Text>
          </View>
        )}

        <Text className="text-sm font-semibold text-neutral-600 mb-2">Fulfillment</Text>
        <View className="flex-row rounded-xl bg-neutral-100 p-1 mb-4">
          {settings?.isDeliveryEnabled !== false && (
            <Pressable
              className={`flex-1 py-2 rounded-lg items-center ${
                fulfillment === 'delivery' ? 'bg-white shadow' : ''
              }`}
              onPress={() => setFulfillment('delivery')}
            >
              <Text className={fulfillment === 'delivery' ? 'font-bold' : ''}>Delivery</Text>
            </Pressable>
          )}
          {settings?.isPickupEnabled !== false && (
            <Pressable
              className={`flex-1 py-2 rounded-lg items-center ${
                fulfillment === 'pickup' ? 'bg-white shadow' : ''
              }`}
              onPress={() => setFulfillment('pickup')}
            >
              <Text className={fulfillment === 'pickup' ? 'font-bold' : ''}>Pickup</Text>
            </Pressable>
          )}
        </View>

        {activeRequiredFields.map((field) => (
          <View key={field} className="mb-3">
            <Text className="text-xs font-medium text-neutral-500 mb-1">
              {FIELD_LABELS[field] ?? field}
            </Text>
            <TextInput
              value={form[field] ?? ''}
              onChangeText={(v) => setField(field, v)}
              placeholder={FIELD_LABELS[field] ?? field}
              placeholderTextColor="#94a3b8"
              keyboardType={
                field === 'phone_number' ? 'phone-pad' : field === 'email' ? 'email-address' : 'default'
              }
              autoCapitalize={field === 'phone_number' || field === 'email' ? 'none' : 'words'}
              className={`rounded-xl border px-3 py-2.5 text-neutral-900 bg-white ${
                errors[field] ? 'border-rose-400' : 'border-neutral-200'
              }`}
            />
            {errors[field] && (
              <Text className="mt-1 text-xs text-rose-600">{errors[field]}</Text>
            )}
          </View>
        ))}

        <View className="mb-3">
          <Text className="text-xs font-medium text-neutral-500 mb-1">Order notes (optional)</Text>
          <TextInput
            value={form.notes ?? ''}
            onChangeText={(v) => setField('notes', v)}
            placeholder="Anything we should know?"
            placeholderTextColor="#94a3b8"
            multiline
            className="rounded-xl border border-neutral-200 px-3 py-2.5 text-neutral-900 bg-white min-h-[64px]"
          />
        </View>

        <Text className="text-sm font-semibold text-neutral-600 mt-4 mb-2">Payment method</Text>
        {paymentOptions.length === 0 ? (
          <Text className="text-xs text-rose-600">
            No payment methods enabled in store settings.
          </Text>
        ) : (
          paymentOptions.map((opt) => (
            <Pressable
              key={opt.key}
              onPress={() => setPayment(opt.key)}
              className={`flex-row items-center border rounded-xl p-3 mb-2 ${
                payment === opt.key ? 'border-brand-600 bg-brand-50' : 'border-neutral-200 bg-white'
              }`}
            >
              <Ionicons name={opt.icon} size={20} color="#0369a1" />
              <Text className="ml-3 flex-1 font-medium">{opt.label}</Text>
              {payment === opt.key && (
                <Ionicons name="checkmark-circle" size={20} color="#0ea5e9" />
              )}
            </Pressable>
          ))
        )}

        <View className="mt-4 bg-neutral-50 rounded-xl p-4">
          <View className="flex-row justify-between">
            <Text className="text-neutral-500">Subtotal</Text>
            <Text>{formatCurrency(subtotal)}</Text>
          </View>
          <View className="flex-row justify-between mt-1">
            <Text className="text-neutral-500">Delivery fee</Text>
            <Text>{formatCurrency(deliveryFee)}</Text>
          </View>
          <View className="flex-row justify-between mt-2 pt-2 border-t border-neutral-200">
            <Text className="font-bold">Total</Text>
            <Text className="font-bold text-brand-600">{formatCurrency(total)}</Text>
          </View>
        </View>
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 px-4 pt-3 pb-8 bg-white border-t border-neutral-200">
        <Pressable
          onPress={submit}
          disabled={submitting || paymentOptions.length === 0 || !storeAccepting}
          className={`rounded-xl py-3 items-center ${
            submitting || !storeAccepting ? 'bg-neutral-400' : 'bg-brand-600 active:bg-brand-700'
          }`}
        >
          {submitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-bold">
              {storeAccepting
                ? t('checkout.placeOrder', { total: formatCurrency(total) })
                : t('checkout.storeClosedCta')}
            </Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
