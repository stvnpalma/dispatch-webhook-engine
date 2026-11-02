export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/integration'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['@swc/jest'],
  },
  globalSetup: '<rootDir>/integration/globalSetup.ts',
  globalTeardown: '<rootDir>/integration/globalTeardown.ts',
};
