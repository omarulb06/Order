// ---------------------------------------------------------------------------
// Sign-in screen (Firebase Auth) — multi-modal entry.
//
//   * Phone OTP          → Clients (SMS; auto-formats to E.164 using
//                          EXPO_PUBLIC_DEFAULT_COUNTRY; 60s resend timer).
//   * Email / Password   → Owners, Admins, and Clients (sign-in + sign-up).
//   * Google Credential  → Clients (expo-auth-session; works in Expo managed).
//   * Guest              → signInAnonymously (optional; whole app also
//                          supports fully-unauthenticated guest checkout).
//
// After a successful sign-in the useEffect listening on `profile` auto-routes
// Owners / Admins directly to the Management Dashboard (per the spec).
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from 'react';
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
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { PhoneRecaptchaVerifierModal } from '@/components/PhoneRecaptchaVerifierModal';
import { useAuthStore } from '@/stores/auth';
import { firebaseApp } from '@/lib/firebase';
import { currentLanguage } from '@/lib/i18n';
import { isValidE164, normalizeE164 } from '@/lib/validation';

WebBrowser.maybeCompleteAuthSession();

type Mode = 'phone' | 'email';
type EmailMode = 'signin' | 'signup';

const RESEND_SECONDS = 60;

export default function SignInScreen() {
  const router = useRouter();

  const signInWithEmail  = useAuthStore((s) => s.signInWithEmail);
  const signUpWithEmail  = useAuthStore((s) => s.signUpWithEmail);
  const signInGoogle     = useAuthStore((s) => s.signInWithGoogleIdToken);
  const signInGuest      = useAuthStore((s) => s.signInAnonymously);
  const startPhoneSignIn = useAuthStore((s) => s.startPhoneSignIn);
  const confirmPhoneOtp  = useAuthStore((s) => s.confirmPhoneOtp);
  const cancelPhoneSignIn = useAuthStore((s) => s.cancelPhoneSignIn);
  const loading          = useAuthStore((s) => s.loading);
  const user             = useAuthStore((s) => s.user);
  const profile          = useAuthStore((s) => s.profile);

  const [mode, setMode]           = useState<Mode>('phone');
  const [emailMode, setEmailMode] = useState<EmailMode>('signin');

  // Google OAuth client ids — optional. When none are configured the
  // button is hidden (the hook still needs a non-empty clientId or it
  // throws during render, which is what crashed the screen on-device).
  const googleIds = {
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || undefined,
    iosClientId:     process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID     || undefined,
    webClientId:     process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID     || undefined,
  };
  const googleConfigured = !!(
    googleIds.androidClientId || googleIds.iosClientId || googleIds.webClientId
  );

  // Email form
  const [email, setEmail]  = useState('');
  const [password, setPwd] = useState('');

  // Phone form
  const [phone, setPhone]           = useState('');
  const [otp, setOtp]               = useState('');
  const [otpSent, setOtpSent]       = useState(false);
  const [resendIn, setResendIn]     = useState(0);
  const recaptchaRef                = useRef<PhoneRecaptchaVerifierModal | null>(null);

  const [working, setWorking] = useState(false);

  // Google provider — reads client IDs from env (one per platform).
  // A harmless placeholder keeps the hook from throwing when Google
  // sign-in isn't configured for this build; the button is hidden then.
  const [request, response, promptAsync] = Google.useAuthRequest({
    ...(googleConfigured
      ? googleIds
      : { clientId: 'google-signin-not-configured.invalid' }),
  });

  useEffect(() => {
    if (response?.type !== 'success') return;
    const idToken     = (response as any).authentication?.idToken;
    const accessToken = (response as any).authentication?.accessToken;
    if (!idToken) return;
    (async () => {
      try {
        await signInGoogle(idToken, accessToken);
      } catch (err: any) {
        Alert.alert('Google sign-in failed', err?.message ?? String(err));
      }
    })();
  }, [response, signInGoogle]);

  // Role-based auto-route after sign-in.
  useEffect(() => {
    if (!user) return;
    // Owners / Admins land on their desk; everyone else goes to the shop.
    const role = profile?.role;
    if (role === 'owner' || role === 'admin') {
      router.replace('/(owner)/dashboard' as any);
    } else {
      router.replace('/');
    }
  }, [user, profile, router]);

  // Resend countdown.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  // --------------------------------------------------------------------
  // Phone OTP
  // --------------------------------------------------------------------
  const normalizedPhone = useMemo(() => {
    if (!phone.trim()) return null;
    return normalizeE164(phone);
  }, [phone]);

  const sendOtp = async () => {
    const n = normalizedPhone;
    if (!n || !isValidE164(n)) {
      Alert.alert(
        'Invalid phone number',
        'Please enter a valid number — e.g. 0501234567 or +972501234567.'
      );
      return;
    }
    if (!recaptchaRef.current) {
      Alert.alert(
        'Captcha not ready',
        'Please wait a moment and try again.'
      );
      return;
    }
    setWorking(true);
    try {
      await startPhoneSignIn(n, recaptchaRef.current as any);
      setOtpSent(true);
      setResendIn(RESEND_SECONDS);
    } catch (err: any) {
      Alert.alert('Could not send code', err?.message ?? String(err));
    } finally {
      setWorking(false);
    }
  };

  const verifyOtp = async () => {
    if (!/^\d{6}$/.test(otp)) {
      Alert.alert('Enter the 6-digit code we sent you.');
      return;
    }
    setWorking(true);
    try {
      await confirmPhoneOtp(otp);
      setOtpSent(false);
      setOtp('');
    } catch (err: any) {
      Alert.alert('Verification failed', err?.message ?? String(err));
    } finally {
      setWorking(false);
    }
  };

  const resetPhoneFlow = () => {
    cancelPhoneSignIn();
    setOtpSent(false);
    setOtp('');
    setResendIn(0);
  };

  // --------------------------------------------------------------------
  // Email submit
  // --------------------------------------------------------------------
  const submitEmail = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Please fill both email and password.');
      return;
    }
    setWorking(true);
    try {
      if (emailMode === 'signin') await signInWithEmail(email.trim(), password);
      else                        await signUpWithEmail(email.trim(), password);
    } catch (err: any) {
      Alert.alert(
        emailMode === 'signin' ? 'Sign-in failed' : 'Sign-up failed',
        err?.message ?? String(err)
      );
    } finally {
      setWorking(false);
    }
  };

  const continueAsGuest = async () => {
    try {
      await signInGuest();
    } catch (err: any) {
      Alert.alert('Could not continue as guest', err?.message ?? String(err));
    }
  };

  const emailSwitchLabel = useMemo(
    () => (emailMode === 'signin'
      ? 'New here? Create an account'
      : 'Have an account? Sign in'),
    [emailMode]
  );

  // --------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-white"
    >
      <PhoneRecaptchaVerifierModal
        ref={recaptchaRef}
        firebaseConfig={(firebaseApp as any).options}
        languageCode={currentLanguage()}
        attemptInvisibleVerification
      />

      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 48 }}>
        <View className="items-center mb-6">
          <View className="h-14 w-14 rounded-full bg-brand-100 items-center justify-center">
            <Ionicons name="lock-closed-outline" size={24} color="#0369a1" />
          </View>
          <Text className="mt-3 text-xl font-bold">Welcome</Text>
          <Text className="mt-1 text-sm text-neutral-500 text-center">
            Clients can sign in with their phone or Google.{'\n'}
            Owners & admins use email/password.
          </Text>
        </View>

        {/* Mode tabs */}
        <View className="flex-row rounded-xl bg-neutral-100 p-1 mb-5">
          <Pressable
            className={`flex-1 py-2 rounded-lg items-center ${mode === 'phone' ? 'bg-white shadow' : ''}`}
            onPress={() => { setMode('phone'); }}
          >
            <Text className={mode === 'phone' ? 'font-bold' : 'text-neutral-600'}>Phone (SMS)</Text>
          </Pressable>
          <Pressable
            className={`flex-1 py-2 rounded-lg items-center ${mode === 'email' ? 'bg-white shadow' : ''}`}
            onPress={() => { setMode('email'); resetPhoneFlow(); }}
          >
            <Text className={mode === 'email' ? 'font-bold' : 'text-neutral-600'}>Email</Text>
          </Pressable>
        </View>

        {mode === 'phone' ? (
          <>
            <Text className="text-xs font-medium text-neutral-500 mb-1">Mobile number</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="0501234567"
              placeholderTextColor="#94a3b8"
              editable={!otpSent}
              keyboardType="phone-pad"
              autoCapitalize="none"
              className="rounded-xl border border-neutral-200 px-3 py-2.5 mb-1 text-neutral-900 bg-white"
            />
            {phone.trim() ? (
              <Text className="text-[11px] text-neutral-500 mb-3">
                {normalizedPhone && isValidE164(normalizedPhone)
                  ? `Will send OTP to ${normalizedPhone}`
                  : 'Enter a valid local or international number.'}
              </Text>
            ) : (
              <View className="mb-3" />
            )}

            {!otpSent ? (
              <Pressable
                onPress={sendOtp}
                disabled={working || loading}
                className={`rounded-xl py-3 items-center ${
                  working ? 'bg-neutral-400' : 'bg-brand-600 active:bg-brand-700'
                }`}
              >
                {working ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-bold">Send verification code</Text>
                )}
              </Pressable>
            ) : (
              <>
                <Text className="text-xs font-medium text-neutral-500 mb-1">
                  Verification code (6 digits)
                </Text>
                <TextInput
                  value={otp}
                  onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  placeholderTextColor="#94a3b8"
                  keyboardType="number-pad"
                  maxLength={6}
                  className="rounded-xl border border-neutral-200 px-3 py-2.5 mb-3 text-neutral-900 bg-white text-center text-xl tracking-widest"
                />

                <Pressable
                  onPress={verifyOtp}
                  disabled={working || loading || otp.length !== 6}
                  className={`rounded-xl py-3 items-center ${
                    working || otp.length !== 6 ? 'bg-neutral-400' : 'bg-brand-600 active:bg-brand-700'
                  }`}
                >
                  {working ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white font-bold">Verify &amp; sign in</Text>
                  )}
                </Pressable>

                <View className="flex-row justify-between mt-3">
                  <Pressable onPress={resetPhoneFlow}>
                    <Text className="text-xs text-neutral-500 underline">Change number</Text>
                  </Pressable>
                  <Pressable
                    onPress={resendIn === 0 ? sendOtp : undefined}
                    disabled={resendIn !== 0 || working}
                  >
                    <Text
                      className={`text-xs ${
                        resendIn === 0 ? 'text-brand-700 underline' : 'text-neutral-400'
                      }`}
                    >
                      {resendIn === 0 ? 'Resend code' : `Resend in ${resendIn}s`}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </>
        ) : (
          <>
            <Text className="text-xs font-medium text-neutral-500 mb-1">Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              keyboardType="email-address"
              className="rounded-xl border border-neutral-200 px-3 py-2.5 mb-3 text-neutral-900 bg-white"
            />
            <Text className="text-xs font-medium text-neutral-500 mb-1">Password</Text>
            <TextInput
              value={password}
              onChangeText={setPwd}
              placeholder="••••••••"
              placeholderTextColor="#94a3b8"
              secureTextEntry
              className="rounded-xl border border-neutral-200 px-3 py-2.5 mb-4 text-neutral-900 bg-white"
            />

            <Pressable
              onPress={submitEmail}
              disabled={working || loading}
              className={`rounded-xl py-3 items-center ${
                working ? 'bg-neutral-400' : 'bg-brand-600 active:bg-brand-700'
              }`}
            >
              {working ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-bold">
                  {emailMode === 'signin' ? 'Sign in' : 'Create account'}
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => setEmailMode(emailMode === 'signin' ? 'signup' : 'signin')}
              className="mt-3"
            >
              <Text className="text-center text-xs text-brand-700 underline">
                {emailSwitchLabel}
              </Text>
            </Pressable>
          </>
        )}

        {/* Divider */}
        <View className="flex-row items-center my-6">
          <View className="flex-1 h-px bg-neutral-200" />
          <Text className="mx-3 text-xs text-neutral-400">OR</Text>
          <View className="flex-1 h-px bg-neutral-200" />
        </View>

        {googleConfigured && (
          <Pressable
            onPress={() => promptAsync()}
            disabled={!request || loading}
            className="rounded-xl py-3 items-center bg-white border border-neutral-200 flex-row justify-center"
          >
            <Ionicons name="logo-google" size={18} color="#0f172a" />
            <Text className="ml-2 text-neutral-900 font-semibold">Continue with Google</Text>
          </Pressable>
        )}

        <Pressable
          onPress={continueAsGuest}
          disabled={loading}
          className="mt-3 rounded-xl py-3 items-center bg-neutral-100"
        >
          <Text className="text-neutral-700 font-medium">Continue as guest</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
