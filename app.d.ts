/// <reference types="expo-router/types" />

declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_SUPABASE_URL: string;
    EXPO_PUBLIC_SUPABASE_ANON_KEY: string;
    EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?: string;
    EXPO_PUBLIC_DEFAULT_COUNTRY?: string;
    EXPO_PUBLIC_STORE_WHATSAPP?: string;
  }
}
