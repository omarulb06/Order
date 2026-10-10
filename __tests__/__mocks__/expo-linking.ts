export const createURL = jest.fn((path: string) => `order://${path.replace(/^\//, '')}`);
export const parse = jest.fn((url: string) => ({ url }));
export const addEventListener = jest.fn(() => ({ remove: jest.fn() }));
export const getInitialURL = jest.fn(async () => null);
export const openURL = jest.fn(async (_url: string) => true);
export const canOpenURL = jest.fn(async (_url: string) => true);

export default {
  createURL,
  parse,
  addEventListener,
  getInitialURL,
  openURL,
  canOpenURL,
};
