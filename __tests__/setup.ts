// Jest setup — loads .env.test (preferred) or .env so src/* has
// EXPO_PUBLIC_* available at import time.
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envTest = resolve(__dirname, '..', '.env.test');
const envPlain = resolve(__dirname, '..', '.env');
if (existsSync(envTest)) {
  loadDotenv({ path: envTest });
} else if (existsSync(envPlain)) {
  loadDotenv({ path: envPlain });
}

// Default to Israel if nothing is set so the phone-validation specs
// are stable regardless of the caller's local env.
if (!process.env.EXPO_PUBLIC_DEFAULT_COUNTRY) {
  process.env.EXPO_PUBLIC_DEFAULT_COUNTRY = 'IL';
}
