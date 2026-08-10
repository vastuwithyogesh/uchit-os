import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function source(relativePath) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

export function functionBody(text, functionName) {
  const marker = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${functionName}\\s*\\(`);
  const match = marker.exec(text);
  if (!match) throw new Error(`Function ${functionName} was not found`);
  const openingParen = text.indexOf("(", match.index);
  let parenDepth = 0;
  let openingBrace = -1;
  for (let index = openingParen; index < text.length; index += 1) {
    if (text[index] === "(") parenDepth += 1;
    if (text[index] === ")") parenDepth -= 1;
    if (parenDepth === 0) {
      openingBrace = text.indexOf("{", index);
      break;
    }
  }
  if (openingBrace < 0) throw new Error(`Function ${functionName} has no body`);
  let depth = 0;
  for (let index = openingBrace; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    if (text[index] === "}") depth -= 1;
    if (depth === 0) return text.slice(openingBrace + 1, index);
  }
  throw new Error(`Function ${functionName} is not balanced`);
}

export function switchCaseBody(text, caseName) {
  const startToken = `case "${caseName}":`;
  const start = text.indexOf(startToken);
  if (start < 0) throw new Error(`Action case ${caseName} was not found`);
  const nextCase = text.indexOf("case \"", start + startToken.length);
  const defaultCase = text.indexOf("default:", start + startToken.length);
  const candidates = [nextCase, defaultCase].filter((index) => index >= 0);
  const end = candidates.length ? Math.min(...candidates) : text.length;
  return text.slice(start, end);
}
