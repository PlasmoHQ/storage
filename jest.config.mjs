/**
 * @type {import('@jest/types').Config.InitialOptions}
 */

const config = {
  clearMocks: true,
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.mjs"],
  extensionsToTreatAsEsm: [".ts"],
  globals: {
    chrome: {
      runtime: {
        id: "plasmo-storage-test"
      }
    }
  },
  transform: {
    "^.+.ts?$": [
      "ts-jest",
      {
        useESM: true,
        isolatedModules: true
      }
    ]
  },
  testMatch: ["**/*.test.ts"],
  verbose: true,
  moduleNameMapper: {
    "^~(.*)$": "<rootDir>/src/$1",
    "^(\\.{1,2}/.*)\\.js$": "$1"
  }
}
export default config
