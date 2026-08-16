import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import { transform } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    return nextResolve(pathToFileURL(path.join(root, `${specifier.slice(2)}.ts`)).href, context);
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".ts")) {
    const source = await fs.readFile(fileURLToPath(url), "utf8");
    const result = await transform(source, { loader: "ts", format: "esm", sourcemap: "inline", sourcefile: fileURLToPath(url) });
    return { format: "module", source: result.code, shortCircuit: true };
  }
  return nextLoad(url, context);
}
