import { createMMKV } from 'react-native-mmkv';
const storage = createMMKV({ id: 'cricket-scorecard' });
export default {
  getItem: (key) => storage.getString(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.remove(key),
  multiGet: (keys) => keys.map((key) => [key, storage.getString(key) ?? null]),
  multiSet: (entries) => entries.forEach(([key, value]) => storage.set(key, value)),
};
