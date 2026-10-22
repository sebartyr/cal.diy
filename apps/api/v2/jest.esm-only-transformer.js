// ts-jest's language service keeps `import` syntax for .js files of "type": "module" packages, so those
// are transpiled to CommonJS with a plain transpileModule; files of CommonJS packages are returned as is,
// except CommonJS bundles using dynamic import(), which is rewritten to require() (see jest.esm-only.ts).
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const isModuleByDirectory = new Map();
const transformerSource = fs.readFileSync(__filename, "utf8");

function isInModulePackage(directory) {
  if (isModuleByDirectory.has(directory)) {
    return isModuleByDirectory.get(directory);
  }
  const packageJsonPath = path.join(directory, "package.json");
  let isModule;
  if (fs.existsSync(packageJsonPath)) {
    isModule = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")).type === "module";
  } else {
    const parent = path.dirname(directory);
    isModule = parent === directory ? false : isInModulePackage(parent);
  }
  isModuleByDirectory.set(directory, isModule);
  return isModule;
}

module.exports = {
  // Without this, Jest keys its cache on the source file only and keeps serving output from an older
  // version of this transformer (or of TypeScript) after either changes.
  getCacheKey(sourceText, sourcePath, options) {
    return crypto
      .createHash("sha256")
      .update(transformerSource)
      .update(ts.version)
      .update(sourcePath)
      .update(sourceText)
      .update(options.configString)
      .digest("hex");
  },
  process(sourceText, sourcePath) {
    const isCommonJsWithDynamicImport = sourcePath.endsWith(".cjs") && sourceText.includes("import(");
    if (!isCommonJsWithDynamicImport && !isInModulePackage(path.dirname(sourcePath))) {
      return { code: sourceText };
    }
    const { outputText, sourceMapText } = ts.transpileModule(sourceText, {
      // A .js name makes TypeScript apply the CommonJS module transform, which also covers import().
      fileName: sourcePath.replace(/\.cjs$/, ".js"),
      compilerOptions: {
        allowJs: true,
        // `(await import("cjs-module")).default` must keep resolving to module.exports once rewritten.
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2021,
        sourceMap: true,
      },
    });
    return { code: outputText, map: sourceMapText };
  },
};
