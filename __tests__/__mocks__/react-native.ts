// Minimal stub of the react-native module surface used by src/lib/*.
// Enough to run WhatsApp / notification helpers under Node.

export const Platform = {
  OS: 'test' as const,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  select: <T,>(spec: Record<string, T>): T | undefined =>
    (spec as any).default ?? (spec as any).ios ?? (spec as any).android ?? (spec as any).web,
};

export const Linking = {
  openURL: jest.fn(async (_url: string) => true),
  canOpenURL: jest.fn(async (_url: string) => true),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  getInitialURL: jest.fn(async () => null),
};

export const Alert = {
  alert: jest.fn(),
};

export const AppState = {
  currentState: 'active',
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
};

export default {
  Platform,
  Linking,
  Alert,
  AppState,
};
