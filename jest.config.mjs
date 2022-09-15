/**
 * @type {import('@jest/types').Config.InitialOptions}
 */

const config = {
  clearMocks: true,
  testEnvironment: "jsdom",
  moduleFileExtensions: ["js", "ts"],
  extensionsToTreatAsEsm: [".ts"],
  globals: {
    chrome: {
      runtime: {
        id: "plasmo-storage-test"
      }
    }
  },
  transform: {
    "^.+.ts?$": ["ts-jest", { isolatedModules: true, useESM: true }]
  },
  testMatch: ["**/*.test.ts"],
  verbose: true,
  moduleNameMapper: {
    "^~(.*)$": "<rootDir>/dist/$1",
    "^(\\.{1,2}/.*)\\.js$": "$1"
  }
}
export default config
