// Some dependencies are now ESM-only ("type": "module"), e.g. htmlparser2 v12 under sanitize-html and
// @noble/hashes under otplib, both reached through @calcom/platform-libraries. Jest's CommonJS runtime
// cannot require them, so every node_modules .js file goes through jest.esm-only-transformer.js, which
// only rewrites files of "type": "module" packages and returns the others untouched.
// The platform-libraries bundle also uses dynamic import() (e.g. react-dom/server to render emails), which
// Jest only allows with --experimental-vm-modules, a flag that in turn forbids requiring the ESM-only
// packages above; the transformer rewrites those import() calls to require() as well.
export const ESM_ONLY_TRANSFORM = {
  "/node_modules/.+\\.js$": "<rootDir>/jest.esm-only-transformer.js",
  "/packages/platform/libraries/dist/.+\\.cjs$": "<rootDir>/jest.esm-only-transformer.js",
};

export const ESM_ONLY_TRANSFORM_IGNORE_PATTERNS = ["^(?!.*/node_modules/)(?!.*/packages/platform/libraries/dist/).*/dist/"];
