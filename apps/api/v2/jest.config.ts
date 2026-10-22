import type { Config } from "jest";

import { ESM_ONLY_TRANSFORM, ESM_ONLY_TRANSFORM_IGNORE_PATTERNS } from "./jest.esm-only";

const config: Config = {
  preset: "ts-jest",
  moduleFileExtensions: ["ts", "js", "json"],
  rootDir: ".",
  moduleNameMapper: {
    "@/(.*)": "<rootDir>/src/$1",
    "test/(.*)": "<rootDir>/test/$1",
  },
  testEnvironment: "node",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.ts$": "ts-jest",
    ...ESM_ONLY_TRANSFORM,
  },
  setupFiles: ["<rootDir>/test/setEnvVars.ts"],
  testPathIgnorePatterns: ["/dist/", "/node_modules/"],
  transformIgnorePatterns: ESM_ONLY_TRANSFORM_IGNORE_PATTERNS,
};

export default config;
