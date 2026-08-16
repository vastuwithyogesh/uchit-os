import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/") || (specifier.startsWith(".") && !/[.][cm]?[jt]sx?$/.test(specifier))) {
    const base = specifier.startsWith("@/") ? repositoryRoot : fileURLToPath(context.parentURL);
    const target = resolvePath(specifier.startsWith("@/") ? base : dirname(base), specifier.startsWith("@/") ? specifier.slice(2) : specifier);
    for (const candidate of [target, `${target}.ts`, `${target}.tsx`, `${target}.js`, `${target}.mjs`, resolvePath(target, "index.ts")]) {
      try { return await nextResolve(pathToFileURL(candidate).href, context); } catch { /* try the next supported source extension */ }
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".ts") || url.endsWith(".tsx")) {
    const source = await readFile(fileURLToPath(url), "utf8");
    const transpiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: url.endsWith(".tsx") ? ts.JsxEmit.ReactJSX : undefined, sourceMap: false } }).outputText;
    return { format: "module", source: transpiled, shortCircuit: true };
  }
  return nextLoad(url, context);
}
