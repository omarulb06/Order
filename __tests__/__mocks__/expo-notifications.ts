export const AndroidImportance = { MAX: 5, HIGH: 4, DEFAULT: 3, LOW: 2, MIN: 1 } as const;

export const setNotificationHandler = jest.fn();
export const getPermissionsAsync = jest.fn(async () => ({ status: 'granted' }));
export const requestPermissionsAsync = jest.fn(async () => ({ status: 'granted' }));
export const setNotificationChannelAsync = jest.fn(async () => undefined);
export const scheduleNotificationAsync = jest.fn(async () => 'noop');

export default {
  AndroidImportance,
  setNotificationHandler,
  getPermissionsAsync,
  requestPermissionsAsync,
  setNotificationChannelAsync,
  scheduleNotificationAsync,
};
