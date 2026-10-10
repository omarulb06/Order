// ---------------------------------------------------------------------------
// Profile editor — logged-in users manage their saved contact details.
// Writes go straight to /profiles/{uid} via the auth store (which strips
// `role` for defense-in-depth; rules enforce it too).
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
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
import { useAuthStore } from '@/stores/auth';
import { isValidE164, normalizeE164 } from '@/lib/validation';

export default function EditProfileScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const signOut = useAuthStore((s) => s.signOut);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [streetName, setStreetName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.fullName ?? '');
    setPhone(profile.phoneNumber ?? '');
    const a = profile.address ?? ({} as any);
    setAddressLine1(a.addressLine1 ?? '');
    setAddressLine2(a.addressLine2 ?? '');
    setStreetName(a.streetName ?? '');
    setCity(a.city ?? '');
    setState(a.state ?? '');
    setPostalCode(a.postalCode ?? '');
    setCountry(a.country ?? '');
  }, [profile]);

  if (!user) {
    return (
      <View className="flex-1 items-center justify-center bg-white p-6">
        <Ionicons name="lock-closed-outline" size={44} color="#94a3b8" />
        <Text className="mt-3 text-neutral-600 text-center">
          Sign in to manage your profile.
        </Text>
        <Pressable
          onPress={() => router.push('/sign-in' as any)}
          className="mt-4 rounded-xl bg-brand-600 px-4 py-2"
        >
          <Text className="text-white font-semibold">Sign in</Text>
        </Pressable>
      </View>
    );
  }

  const save = async () => {
    if (!fullName.trim()) {
      Alert.alert('Full name is required.');
      return;
    }
    let phoneE164: string | null = null;
    if (phone.trim()) {
      phoneE164 = normalizeE164(phone);
      if (!phoneE164 || !isValidE164(phoneE164)) {
        Alert.alert('Invalid phone', 'Enter a valid number, e.g. 0501234567 or +972501234567.');
        return;
      }
    }

    setSaving(true);
    try {
      await updateProfile({
        fullName: fullName.trim(),
        phoneNumber: phoneE164,
        address: {
          addressLine1: addressLine1.trim(),
          addressLine2: addressLine2.trim() || undefined,
          streetName: streetName.trim() || undefined,
          city: city.trim(),
          state: state.trim() || undefined,
          postalCode: postalCode.trim() || undefined,
          country: country.trim() || undefined,
        },
      });
      Alert.alert('Saved', 'Your profile was updated.');
      router.back();
    } catch (err: any) {
      Alert.alert('Save failed', err?.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-neutral-50"
    >
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <View className="rounded-2xl bg-white border border-neutral-100 p-4">
          <Text className="text-xs font-semibold text-neutral-500 uppercase mb-3">Contact</Text>
          <Field label="Full name" value={fullName} onChange={setFullName} />
          <Field
            label="Phone"
            value={phone}
            onChange={setPhone}
            keyboardType="phone-pad"
            autoCapitalize="none"
          />
          <View className="mb-3">
            <Text className="text-xs font-medium text-neutral-500 mb-1">Email</Text>
            <View className="rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2.5">
              <Text className="text-neutral-400">{profile?.email ?? user.email ?? '—'}</Text>
            </View>
          </View>
        </View>

        <View className="mt-4 rounded-2xl bg-white border border-neutral-100 p-4">
          <Text className="text-xs font-semibold text-neutral-500 uppercase mb-3">Address</Text>
          <Field label="Address line 1" value={addressLine1} onChange={setAddressLine1} />
          <Field label="Address line 2 (floor / apt)" value={addressLine2} onChange={setAddressLine2} />
          <Field label="Street name" value={streetName} onChange={setStreetName} />
          <Field label="City" value={city} onChange={setCity} />
          <Field label="State / Region" value={state} onChange={setState} />
          <Field label="Postal code" value={postalCode} onChange={setPostalCode} />
          <Field label="Country" value={country} onChange={setCountry} />
        </View>

        <Pressable
          onPress={save}
          disabled={saving}
          className={`mt-5 rounded-xl py-3 items-center ${
            saving ? 'bg-neutral-400' : 'bg-brand-600 active:bg-brand-700'
          }`}
        >
          {saving ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-bold">Save profile</Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => {
            signOut().finally(() => router.replace('/' as any));
          }}
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

function Field({
  label,
  value,
  onChange,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboardType?: any;
  autoCapitalize?: 'none' | 'sentences' | 'words';
}) {
  return (
    <View className="mb-3">
      <Text className="text-xs font-medium text-neutral-500 mb-1">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? 'words'}
        className="rounded-xl border border-neutral-200 px-3 py-2.5 bg-white text-neutral-900"
      />
    </View>
  );
}
