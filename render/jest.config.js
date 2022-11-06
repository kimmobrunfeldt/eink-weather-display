/** @type {import('ts-jest').JestConfigWithTsJest} */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  /**
   * Automatically restore mock state and implementation before every test.
   * Equivalent to calling jest.restoreAllMocks() before each test. This will
   * lead to any mocks having their fake implementations removed and restores
   * their initial implementation.
   */
  restoreMocks: true,
  setupFilesAfterEnv: ['./src/jestSetup.ts'],
  moduleNameMapper: {
    'src/(.*)': '<rootDir>/src/$1'
  },
};