module.exports = {
  preset: '@react-native/jest-preset',
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'],
  setupFiles: ['./jest.setup.js'],
  // lucide ships ESM as .mjs, which the RN Jest transform skips: use its CommonJS build.
  moduleNameMapper: { '^lucide-react-native$': '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js' },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|lucide-react-native|react-native-svg|react-native-screens|react-native-safe-area-context|@op-engineering)/)',
  ],
};
