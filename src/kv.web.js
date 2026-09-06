// Browser persistence deliberately reports quota/privacy-mode errors to the UI.
export default {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
  multiGet: (keys) => keys.map((key) => [key, localStorage.getItem(key)]),
  multiSet: (entries) => entries.forEach(([key, value]) => localStorage.setItem(key, value)),
};
