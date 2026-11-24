/* Native module mocks so the whole app can boot inside Jest. */
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-native-community/netinfo', () => require('@react-native-community/netinfo/jest/netinfo-mock.js'));

jest.mock('@react-native-community/geolocation', () => ({
  getCurrentPosition: (ok) => ok({ coords: { latitude: 9.4981, longitude: 76.3388, accuracy: 12 }, timestamp: Date.now() }),
}));

jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  return { WebView: (props) => require('react').createElement(View, { testID: 'webview', ...props }) };
});

/* In-memory stand-in for op-sqlite that understands the statements SQLiteStore issues. */
jest.mock('@op-engineering/op-sqlite', () => {
  const dbs = {};
  return {
    open: ({ name }) => {
      const d = (dbs[name] = dbs[name] || { messages: new Map(), kv: new Map() });
      return {
        execute: async (sql, p = []) => {
          const q = sql.replace(/\s+/g, ' ').trim();
          if (/^CREATE/.test(q)) return { rows: [] };
          if (q.startsWith('SELECT data FROM messages WHERE')) {
            const v = d.messages.get(p[0]);
            return { rows: v ? [{ data: v.data }] : [] };
          }
          if (q.startsWith('SELECT data FROM messages ORDER BY')) {
            return { rows: [...d.messages.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).map(r => ({ data: r.data })) };
          }
          if (q.startsWith('INSERT INTO messages')) {
            d.messages.set(p[0], { created_at: p[4], data: p[6] });
            return { rows: [] };
          }
          if (q.startsWith('SELECT value FROM kv')) {
            return { rows: d.kv.has(p[0]) ? [{ value: d.kv.get(p[0]) }] : [] };
          }
          if (q.startsWith('INSERT INTO kv')) {
            d.kv.set(p[0], p[1]);
            return { rows: [] };
          }
          throw new Error('unmocked SQL: ' + q);
        },
      };
    },
  };
});
