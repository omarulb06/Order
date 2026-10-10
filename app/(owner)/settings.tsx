import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { DAY_KEYS, isValidDayHours } from '@/lib/storeHours';
import type { BusinessHours, PaymentMethod } from '@/types/database';

const AVAILABLE_FIELDS = [
  'full_name',
  'phone_number',
  'email',
  'address_line1',
  'address_line2',
  'street_name',
  'city',
  'state',
  'postal_code',
  'country',
];

export default function OwnerSettings() {
  const settings = useSettingsStore((s) => s.settings);
  const load = useSettingsStore((s) => s.load);
  const save = useSettingsStore((s) => s.save);
  const signOut = useAuthStore((s) => s.signOut);

  const [deliveryFee, setDeliveryFee] = useState('0');
  const [minOrder, setMinOrder] = useState('0');
  const [delivery, setDelivery] = useState(true);
  const [pickup, setPickup] = useState(true);
  const [storeOpen, setStoreOpen] = useState(true);
  const [hours, setHours] = useState<BusinessHours | null>(null);
  const [fields, setFields] = useState<string[]>([]);
  const [payments, setPayments] = useState<Record<PaymentMethod, boolean>>({
    cash: true,
    stripe: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!settings) return;
    setDeliveryFee(String(settings.deliveryFee));
    setMinOrder(String(settings.minOrderAmount));
    setDelivery(settings.isDeliveryEnabled);
    setPickup(settings.isPickupEnabled);
    setStoreOpen(settings.isStoreOpen !== false);
    setHours(settings.businessHours ?? null);
    setFields(settings.requiredCheckoutFields ?? []);
    setPayments({
      cash:   !!settings.paymentMethods?.cash,
      stripe: !!settings.paymentMethods?.stripe,
    });
  }, [settings]);

  const updateDay = (day: keyof BusinessHours, patch: Partial<BusinessHours[typeof day]>) => {
    setHours((prev) => (prev ? { ...prev, [day]: { ...prev[day], ...patch } } : prev));
  };

  const toggleField = (f: string) => {
    setFields((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
    );
  };

  const togglePayment = (p: PaymentMethod) =>
    setPayments((prev) => ({ ...prev, [p]: !prev[p] }));

  const persist = async () => {
    if (hours) {
      const badDay = DAY_KEYS.find((d) => !isValidDayHours(hours[d]));
      if (badDay) {
        Alert.alert(
          'Invalid hours',
          `"${badDay}" needs times in HH:MM 24h format (e.g. 08:00).`
        );
        return;
      }
    }
    setSaving(true);
    try {
      await save({
        deliveryFee:            Number(deliveryFee) || 0,
        minOrderAmount:         Number(minOrder)    || 0,
        isDeliveryEnabled:      delivery,
        isPickupEnabled:        pickup,
        isStoreOpen:            storeOpen,
        businessHours:          hours ?? undefined,
        requiredCheckoutFields: fields,
        paymentMethods:         payments,
      });
      Alert.alert('Saved', 'Store settings updated.');
    } catch (err: any) {
      Alert.alert('Save failed', err?.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#0ea5e9" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-neutral-50"
    >
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
        {/* Master open/closed override — applies instantly. */}
        <View
          className={`mt-2 rounded-2xl border p-4 flex-row items-center justify-between ${
            storeOpen ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
          }`}
        >
          <View className="flex-1 pr-3">
            <Text className="text-base font-bold text-neutral-900">
              {storeOpen ? 'Store is OPEN' : 'Store is CLOSED'}
            </Text>
            <Text className="text-xs text-neutral-500 mt-0.5">
              {storeOpen
                ? 'Customers can place orders right now.'
                : 'Checkout is blocked for all customers until you reopen.'}
            </Text>
          </View>
          <Switch
            value={storeOpen}
            onValueChange={async (v) => {
              setStoreOpen(v);
              try {
                await save({ isStoreOpen: v });
              } catch (err: any) {
                setStoreOpen(!v);
                Alert.alert('Could not update store status', err?.message ?? 'Unknown error');
              }
            }}
          />
        </View>

        {hours && (
          <Section title="Business hours">
            {DAY_KEYS.map((day) => {
              const d = hours[day];
              return (
                <View key={day} className="px-4 py-2.5 border-b border-neutral-100">
                  <View className="flex-row items-center justify-between">
                    <Text className="capitalize text-sm text-neutral-800 w-24">{day}</Text>
                    <Switch value={d.active} onValueChange={(v) => updateDay(day, { active: v })} />
                  </View>
                  {d.active && (
                    <View className="flex-row items-center mt-2">
                      <TextInput
                        value={d.open}
                        onChangeText={(v) => updateDay(day, { open: v })}
                        placeholder="08:00"
                        keyboardType="numbers-and-punctuation"
                        className="w-20 rounded-lg border border-neutral-200 px-2 py-1 text-center bg-white"
                      />
                      <Text className="mx-2 text-neutral-500">to</Text>
                      <TextInput
                        value={d.close}
                        onChangeText={(v) => updateDay(day, { close: v })}
                        placeholder="22:00"
                        keyboardType="numbers-and-punctuation"
                        className="w-20 rounded-lg border border-neutral-200 px-2 py-1 text-center bg-white"
                      />
                      <Text className="ml-2 text-[10px] text-neutral-400 flex-1">
                        HH:MM 24h · close earlier than open = overnight · same open/close = 24h
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </Section>
        )}

        <Section title="Fees">
          <Row label="Delivery fee (USD)">
            <TextInput
              value={deliveryFee}
              onChangeText={setDeliveryFee}
              keyboardType="decimal-pad"
              className="text-right w-28 rounded-lg border border-neutral-200 px-2 py-1 bg-white"
            />
          </Row>
          <Row label="Minimum order (USD)">
            <TextInput
              value={minOrder}
              onChangeText={setMinOrder}
              keyboardType="decimal-pad"
              className="text-right w-28 rounded-lg border border-neutral-200 px-2 py-1 bg-white"
            />
          </Row>
        </Section>

        <Section title="Fulfillment">
          <Row label="Delivery enabled">
            <Switch value={delivery} onValueChange={setDelivery} />
          </Row>
          <Row label="Pickup enabled">
            <Switch value={pickup} onValueChange={setPickup} />
          </Row>
        </Section>

        <Section title="Required checkout fields">
          {AVAILABLE_FIELDS.map((f) => (
            <Row key={f} label={f.replace(/_/g, ' ')}>
              <Switch value={fields.includes(f)} onValueChange={() => toggleField(f)} />
            </Row>
          ))}
        </Section>

        <Section title="Payment methods">
          <Row label="Cash on delivery">
            <Switch value={payments.cash} onValueChange={() => togglePayment('cash')} />
          </Row>
          <Row label="Card (Stripe)">
            <Switch value={payments.stripe} onValueChange={() => togglePayment('stripe')} />
          </Row>
        </Section>

        <Pressable
          onPress={persist}
          disabled={saving}
          className={`mt-6 rounded-xl py-3 items-center ${
            saving ? 'bg-neutral-400' : 'bg-brand-600 active:bg-brand-700'
          }`}
        >
          {saving ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-bold">Save settings</Text>
          )}
        </Pressable>

        <Pressable
          onPress={signOut}
          className="mt-3 rounded-xl py-3 items-center bg-white border border-neutral-200"
        >
          <View className="flex-row items-center">
            <Ionicons name="log-out-outline" size={16} color="#be123c" />
            <Text className="ml-2 text-rose-600 font-semibold">Sign out</Text>
          </View>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mt-4">
      <Text className="px-1 text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
        {title}
      </Text>
      <View className="bg-white rounded-2xl overflow-hidden border border-neutral-100">
        {children}
      </View>
    </View>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="flex-row items-center justify-between px-4 py-3 border-b border-neutral-100">
      <Text className="capitalize text-sm text-neutral-800">{label}</Text>
      {children}
    </View>
  );
}
