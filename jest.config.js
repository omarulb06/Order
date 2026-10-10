/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }],
  },
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/?(*.)+(spec|test).ts?(x)'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Stub out React Native + Expo native modules so pure-logic tests
    // under src/lib/* can run in a plain Node environment.
    '^react-native$': '<rootDir>/__tests__/__mocks__/react-native.ts',
    '^react-native-url-polyfill/auto$':
      '<rootDir>/__tests__/__mocks__/noop.ts',
    '^@react-native-async-storage/async-storage$':
      '<rootDir>/__tests__/__mocks__/async-storage.ts',
    '^expo-linking$': '<rootDir>/__tests__/__mocks__/expo-linking.ts',
    '^expo-notifications$':
      '<rootDir>/__tests__/__mocks__/expo-notifications.ts',
    '^expo-constants$': '<rootDir>/__tests__/__mocks__/noop.ts',
  },
  setupFiles: ['<rootDir>/__tests__/setup.ts'],
  testTimeout: 30000,
  // Pure-logic + Firestore-rules tests. Integration suites that require
  // the local emulator auto-skip when FIREBASE_EMULATOR_RUNNING != '1'.
  bail: false,
  verbose: true,
};
