/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.service.ts', 'src/**/*.controller.ts', 'src/**/*.config.ts'],
  globalSetup: '<rootDir>/tests/jest-global-setup.js',
  globalTeardown: '<rootDir>/tests/jest-global-teardown.js',
};
