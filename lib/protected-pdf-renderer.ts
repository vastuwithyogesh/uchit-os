const PASSWORD_PADDING = new Uint8Array([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a
]);

export const PROTECTED_PDF_RENDERER_VERSION = "uchit-cloudflare-pdf/r3";
export const PROTECTED_PDF_SECURITY_PROFILE = "PDF_STANDARD_R3_PRINT_ONLY";
export const PROTECTED_PDF_PAGE_CONFIG = "A4_595x842_STRUCTURED_TABLES_AOU_CARDS_VECTOR_SHAKTI_VISIBLE_MANUAL_EVIDENCE_JPEG_PNG";
export const PROTECTED_PDF_PERMISSION_VALUE = -1852;

type EvidenceInput = {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  checksumSha256: string;
  role?: "PLAN_AUTHENTICATION" | "MANUAL_UTILITY_SHEET";
};

type RenderInput = {
  reportVersionId: string;
  sourceSnapshotHash: string;
  html: string;
  evidence: EvidenceInput | readonly EvidenceInput[];
  ownerSecret: string;
};

type PageSpec = { kind: "LAYOUT"; commands: string[] } | { kind: "VISIBLE_EVIDENCE"; evidenceIndex: number };

const textEncoder = new TextEncoder();
const latin1 = new TextDecoder("latin1");

function concat(...parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function ascii(value: string) {
  return new Uint8Array([...value].map((character) => character.charCodeAt(0) & 0xff));
}

function hex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function rotateLeft(value: number, shift: number) {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

/** Small self-contained MD5 implementation required by PDF Standard Security R3. */
export function md5(input: Uint8Array) {
  const bitLength = input.length * 8;
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(input); padded[input.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, bitLength >>> 0, true);
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000), true);
  const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const constants = Array.from({ length: 64 }, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0);
  let a0 = 0x67452301; let b0 = 0xefcdab89; let c0 = 0x98badcfe; let d0 = 0x10325476;
  for (let offset = 0; offset < paddedLength; offset += 64) {
    const words = Array.from({ length: 16 }, (_, index) => view.getUint32(offset + index * 4, true));
    let a = a0; let b = b0; let c = c0; let d = d0;
    for (let index = 0; index < 64; index++) {
      let f: number; let g: number; let shift: number;
      if (index < 16) { f = (b & c) | (~b & d); g = index; shift = shifts[index % 4]; }
      else if (index < 32) { f = (d & b) | (~d & c); g = (5 * index + 1) % 16; shift = shifts[4 + index % 4]; }
      else if (index < 48) { f = b ^ c ^ d; g = (3 * index + 5) % 16; shift = shifts[8 + index % 4]; }
      else { f = c ^ (b | ~d); g = (7 * index) % 16; shift = shifts[12 + index % 4]; }
      const nextD = c; c = b;
      b = (b + rotateLeft((a + f + constants[index] + words[g]) >>> 0, shift)) >>> 0;
      a = d; d = nextD;
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
  }
  const output = new Uint8Array(16); const outputView = new DataView(output.buffer);
  outputView.setUint32(0, a0, true); outputView.setUint32(4, b0, true); outputView.setUint32(8, c0, true); outputView.setUint32(12, d0, true);
  return output;
}

export function rc4(key: Uint8Array, input: Uint8Array) {
  const state = Uint8Array.from({ length: 256 }, (_, index) => index);
  let j = 0;
  for (let i = 0; i < 256; i++) { j = (j + state[i] + key[i % key.length]) & 255; [state[i], state[j]] = [state[j], state[i]]; }
  const output = new Uint8Array(input.length); let i = 0; j = 0;
  for (let index = 0; index < input.length; index++) {
    i = (i + 1) & 255; j = (j + state[i]) & 255; [state[i], state[j]] = [state[j], state[i]];
    output[index] = input[index] ^ state[(state[i] + state[j]) & 255];
  }
  return output;
}

function passwordBytes(password: string) {
  const source = textEncoder.encode(password).slice(0, 32);
  const output = new Uint8Array(32); output.set(source); output.set(PASSWORD_PADDING.slice(0, 32 - source.length), source.length);
  return output;
}

function xorKey(key: Uint8Array, iteration: number) {
  return key.map((byte) => byte ^ iteration);
}

function securityMaterial(ownerPassword: string, fileId: Uint8Array) {
  let ownerKey = md5(passwordBytes(ownerPassword));
  for (let iteration = 0; iteration < 50; iteration++) ownerKey = md5(ownerKey);
  ownerKey = ownerKey.slice(0, 16);
  let ownerEntry = rc4(ownerKey, passwordBytes(""));
  for (let iteration = 1; iteration <= 19; iteration++) ownerEntry = rc4(xorKey(ownerKey, iteration), ownerEntry);
  const permissionBytes = new Uint8Array(4);
  new DataView(permissionBytes.buffer).setInt32(0, PROTECTED_PDF_PERMISSION_VALUE, true);
  let fileKey = md5(concat(passwordBytes(""), ownerEntry, permissionBytes, fileId));
  for (let iteration = 0; iteration < 50; iteration++) fileKey = md5(fileKey.slice(0, 16));
  fileKey = fileKey.slice(0, 16);
  let userEntry = rc4(fileKey, md5(concat(PASSWORD_PADDING, fileId)));
  for (let iteration = 1; iteration <= 19; iteration++) userEntry = rc4(xorKey(fileKey, iteration), userEntry);
  userEntry = concat(userEntry, new Uint8Array(16));
  return { ownerEntry, userEntry, fileKey };
}

function objectEncryptionKey(fileKey: Uint8Array, objectNumber: number) {
  const suffix = new Uint8Array([objectNumber & 255, (objectNumber >>> 8) & 255, (objectNumber >>> 16) & 255, 0, 0]);
  return md5(concat(fileKey, suffix)).slice(0, Math.min(fileKey.length + 5, 16));
}

function encryptedHex(value: string, fileKey: Uint8Array, objectNumber: number) {
  return `<${hex(rc4(objectEncryptionKey(fileKey, objectNumber), textEncoder.encode(value)))}>`;
}

function htmlPlainText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/(p|div|section|h1|h2|h3|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'")
    .replace(/[\u0080-\uffff]/g, (character) => ({ "₹": "INR ", "—": "-", "–": "-", "·": "-", "°": " degrees" }[character] ?? "?"))
    .split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function wrapLines(lines: string[], width = 92) {
  const wrapped: string[] = [];
  for (const line of lines) {
    let remaining = line;
    while (remaining.length > width) {
      let split = remaining.lastIndexOf(" ", width); if (split < width / 2) split = width;
      wrapped.push(remaining.slice(0, split)); remaining = remaining.slice(split).trimStart();
    }
    wrapped.push(remaining);
  }
  return wrapped;
}

function chunkLines(lines: string[]) {
  const chunks: string[][] = [];
  for (let offset = 0; offset < lines.length; offset += 45) chunks.push(lines.slice(offset, offset + 45));
  return chunks;
}

function jpegDimensions(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("Visible manual evidence must be a valid JPEG image.");
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1]; offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const components = bytes[offset + 7];
      if (!width || !height || components !== 3) throw new Error("Visible manual evidence must be an RGB JPEG image.");
      return { width, height };
    }
    offset += length;
  }
  throw new Error("Visible manual evidence JPEG dimensions could not be verified.");
}

function pngChunks(bytes: Uint8Array) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || !signature.every((value, index) => bytes[index] === value)) throw new Error("Visible manual evidence must be a valid PNG image.");
  const chunks: Array<{ type: string; data: Uint8Array }> = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    if (offset + 12 + length > bytes.length) throw new Error("Visible manual evidence PNG is truncated.");
    chunks.push({ type, data: bytes.slice(offset + 8, offset + 8 + length) });
    offset += 12 + length;
    if (type === "IEND") break;
  }
  return chunks;
}

async function streamTransform(bytes: Uint8Array, mode: "compress" | "decompress") {
  const stream = mode === "compress" ? new CompressionStream("deflate") : new DecompressionStream("deflate");
  const writer = stream.writable.getWriter();
  await writer.write(bytes.slice()); await writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

function paeth(a: number, b: number, c: number) {
  const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

async function preparePngImage(bytes: Uint8Array) {
  const chunks = pngChunks(bytes); const header = chunks.find((chunk) => chunk.type === "IHDR")?.data;
  if (!header || header.length !== 13) throw new Error("Visible manual evidence PNG header is missing.");
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const width = view.getUint32(0); const height = view.getUint32(4); const bitDepth = header[8]; const colourType = header[9]; const interlace = header[12];
  if (!width || !height || bitDepth !== 8 || ![2, 6].includes(colourType) || interlace !== 0) throw new Error("Visible manual evidence PNG must be a non-interlaced 8-bit RGB or RGBA image.");
  const compressed = concat(...chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data));
  if (!compressed.length) throw new Error("Visible manual evidence PNG image data is missing.");
  const filtered = await streamTransform(compressed, "decompress"); const components = colourType === 6 ? 4 : 3; const stride = width * components;
  if (filtered.length !== (stride + 1) * height) throw new Error("Visible manual evidence PNG dimensions do not match its image data.");
  const reconstructed = new Uint8Array(stride * height); let sourceOffset = 0;
  for (let row = 0; row < height; row++) {
    const filter = filtered[sourceOffset++]; const rowOffset = row * stride;
    for (let column = 0; column < stride; column++) {
      const raw = filtered[sourceOffset++]; const left = column >= components ? reconstructed[rowOffset + column - components] : 0;
      const up = row > 0 ? reconstructed[rowOffset + column - stride] : 0;
      const upperLeft = row > 0 && column >= components ? reconstructed[rowOffset + column - stride - components] : 0;
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? paeth(left, up, upperLeft) : -1;
      if (predictor < 0) throw new Error("Visible manual evidence PNG uses an unsupported row filter.");
      reconstructed[rowOffset + column] = (raw + predictor) & 255;
    }
  }
  const rgb = new Uint8Array(width * height * 3);
  for (let source = 0, target = 0; source < reconstructed.length; source += components) { rgb[target++] = reconstructed[source]; rgb[target++] = reconstructed[source + 1]; rgb[target++] = reconstructed[source + 2]; }
  return { width, height, bytes: await streamTransform(rgb, "compress"), filter: "/FlateDecode" };
}

async function prepareVisibleImage(evidence: EvidenceInput) {
  if (evidence.mimeType === "image/jpeg") {
    const dimensions = jpegDimensions(evidence.bytes);
    return { ...dimensions, bytes: evidence.bytes.slice(), filter: "/DCTDecode" };
  }
  if (evidence.mimeType === "image/png") return preparePngImage(evidence.bytes);
  throw new Error("The Founder-approved manual utility sheet must be an RGB JPEG or non-interlaced RGB/RGBA PNG for visible protected-PDF placement.");
}

function pdfString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[\r\n]/g, " ");
}

async function sha256Bytes(bytes: Uint8Array) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer));
}

export async function renderProtectedPdf(input: RenderInput) {
  if (!input.ownerSecret || input.ownerSecret.length < 32) throw new Error("Protected PDF owner secret must contain at least 32 characters.");
  const evidenceList = Array.isArray(input.evidence) ? input.evidence : [input.evidence];
  if (!evidenceList.length) throw new Error("At least one protected evidence attachment is required.");
  const seed = textEncoder.encode(`${input.reportVersionId}|${input.sourceSnapshotHash}|${evidenceList.map((item) => item.checksumSha256).join(",")}|${PROTECTED_PDF_RENDERER_VERSION}`);
  const fileId = (await sha256Bytes(seed)).slice(0, 16);
  const ownerPassword = hex(await sha256Bytes(textEncoder.encode(`${input.ownerSecret}|${input.reportVersionId}|${input.sourceSnapshotHash}`)));
  const security = securityMaterial(ownerPassword, fileId);
  const manualEvidenceIndex = evidenceList.findIndex((item) => item.role === "MANUAL_UTILITY_SHEET");
  const pages: PageSpec[] = [];
  if (manualEvidenceIndex >= 0) {
    let sectionEight = input.html.search(/<section><h2>8\. Utility mapping and zoning\b/i);
    if (sectionEight < 0) sectionEight = input.html.search(/8\. Utility mapping and zoning\b/i);
    if (sectionEight < 0) throw new Error("The visible manual evidence page requires the approved report section ordering.");
    pages.push(...layoutProtectedReportHtml(input.html.slice(0, sectionEight)).map((page) => ({ kind: "LAYOUT" as const, commands: page.commands })));
    pages.push({ kind: "VISIBLE_EVIDENCE", evidenceIndex: manualEvidenceIndex });
    pages.push(...layoutProtectedReportHtml(input.html.slice(sectionEight)).map((page) => ({ kind: "LAYOUT" as const, commands: page.commands })));
  } else {
    pages.push(...layoutProtectedReportHtml(input.html).map((page) => ({ kind: "LAYOUT" as const, commands: page.commands })));
  }
  if (!pages.length) pages.push({ kind: "LAYOUT", commands: ["BT /F2 12 Tf 50 775 Td (Uchit Vastu India protected report) Tj ET"] });
  const pageCount = pages.length;
  const pageStart = 3; const fontObject = pageStart + pageCount; const boldFontObject = fontObject + 1; const contentStart = boldFontObject + 1;
  const embeddedStart = contentStart + pageCount; const fileSpecStart = embeddedStart + evidenceList.length;
  const namesObject = fileSpecStart + evidenceList.length;
  const visibleImageStart = namesObject + 1;
  const visibleEvidencePages = pages.filter((page): page is Extract<PageSpec, { kind: "VISIBLE_EVIDENCE" }> => page.kind === "VISIBLE_EVIDENCE");
  const encryptObject = visibleImageStart + visibleEvidencePages.length;
  const objects = new Map<number, Uint8Array>();
  const pageRefs = Array.from({ length: pageCount }, (_, index) => `${pageStart + index} 0 R`).join(" ");
  objects.set(1, ascii(`<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles ${namesObject} 0 R >> >>`));
  objects.set(2, ascii(`<< /Type /Pages /Kids [${pageRefs}] /Count ${pageCount} >>`));
  objects.set(fontObject, ascii(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`));
  objects.set(boldFontObject, ascii(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`));
  let visibleImageIndex = 0;
  for (const [index, page] of pages.entries()) {
    const pageObject = pageStart + index; const contentObject = contentStart + index;
    const imageObject = page.kind === "VISIBLE_EVIDENCE" ? visibleImageStart + visibleImageIndex++ : undefined;
    const xObject = imageObject ? ` /XObject << /Im1 ${imageObject} 0 R >>` : "";
    objects.set(pageObject, ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObject} 0 R /F2 ${boldFontObject} 0 R >>${xObject} >> /Contents ${contentObject} 0 R >>`));
    let body: string;
    if (page.kind === "LAYOUT") {
      body = page.commands.join(" ");
    } else {
      const evidence = evidenceList[page.evidenceIndex];
      const image = await prepareVisibleImage(evidence);
      const scale = Math.min(495 / image.width, 620 / image.height);
      const drawWidth = Math.round(image.width * scale * 100) / 100;
      const drawHeight = Math.round(image.height * scale * 100) / 100;
      const drawX = Math.round((595 - drawWidth) * 50) / 100;
      const drawY = Math.round((760 - drawHeight) * 100) / 100;
      body = `BT /F2 12 Tf 50 785 Td (Original full-colour hand-marked utility sheet) Tj ET `
        + `BT /F1 8 Tf 50 770 Td (Evidence SHA-256: ${pdfString(evidence.checksumSha256)}) Tj ET `
        + `q ${drawWidth} 0 0 ${drawHeight} ${drawX} ${drawY} cm /Im1 Do Q`;
      const encryptedImage = rc4(objectEncryptionKey(security.fileKey, imageObject!), image.bytes);
      objects.set(imageObject!, concat(ascii(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter ${image.filter} /Length ${encryptedImage.length} >>\nstream\n`), encryptedImage, ascii("\nendstream")));
    }
    const commands = `${body} 0.69 0.55 0.34 RG 0.8 w 44 812 m 551 812 l S 0.88 0.86 0.82 RG 0.5 w 36 32 523 778 re S `
      + `0 0 0 rg BT /F2 16 Tf 50 820 Td (UCHIT VASTU INDIA) Tj ET BT /F1 8 Tf 450 821 Td (FOUNDER EDITION) Tj ET `
      + `0 0 0 rg BT /F1 8 Tf 50 20 Td (Immutable protected report - authorised access only) Tj ET `
      + `BT /F1 8 Tf 505 20 Td (Page ${index + 1}/${pageCount}) Tj ET`;
    const encrypted = rc4(objectEncryptionKey(security.fileKey, contentObject), ascii(commands));
    objects.set(contentObject, concat(ascii(`<< /Length ${encrypted.length} >>\nstream\n`), encrypted, ascii("\nendstream")));
  }
  const namePairs: string[] = [];
  evidenceList.forEach((evidence, index) => {
    const embeddedObject = embeddedStart + index; const fileSpecObject = fileSpecStart + index;
    const evidenceBytes = evidence.bytes.slice(); const encryptedEvidence = rc4(objectEncryptionKey(security.fileKey, embeddedObject), evidenceBytes);
    const mimeName = evidence.mimeType.replace("/", "#2F");
    objects.set(embeddedObject, concat(ascii(`<< /Type /EmbeddedFile /Subtype /${mimeName} /Params << /Size ${evidenceBytes.length} /CheckSum <${hex(md5(evidenceBytes))}> >> /Length ${encryptedEvidence.length} >>\nstream\n`), encryptedEvidence, ascii("\nendstream")));
    objects.set(fileSpecObject, ascii(`<< /Type /Filespec /F ${encryptedHex(evidence.fileName, security.fileKey, fileSpecObject)} /UF ${encryptedHex(evidence.fileName, security.fileKey, fileSpecObject)} /Desc ${encryptedHex(`Original authentication evidence SHA-256 ${evidence.checksumSha256}`, security.fileKey, fileSpecObject)} /EF << /F ${embeddedObject} 0 R >> >>`));
    namePairs.push(`${encryptedHex(evidence.fileName, security.fileKey, namesObject)} ${fileSpecObject} 0 R`);
  });
  objects.set(namesObject, ascii(`<< /Names [${namePairs.join(" ")}] >>`));
  objects.set(encryptObject, ascii(`<< /Filter /Standard /V 2 /R 3 /Length 128 /O <${hex(security.ownerEntry)}> /U <${hex(security.userEntry)}> /P ${PROTECTED_PDF_PERMISSION_VALUE} >>`));

  const header = concat(ascii("%PDF-1.4\n%"), new Uint8Array([0xe2, 0xe3, 0xcf, 0xd3]), ascii("\n"));
  const pieces: Uint8Array[] = [header]; const offsets = [0]; let length = header.length;
  for (let objectNumber = 1; objectNumber <= encryptObject; objectNumber++) {
    offsets[objectNumber] = length;
    const object = concat(ascii(`${objectNumber} 0 obj\n`), objects.get(objectNumber)!, ascii("\nendobj\n"));
    pieces.push(object); length += object.length;
  }
  const xrefOffset = length;
  let xref = `xref\n0 ${encryptObject + 1}\n0000000000 65535 f \n`;
  for (let objectNumber = 1; objectNumber <= encryptObject; objectNumber++) xref += `${String(offsets[objectNumber]).padStart(10, "0")} 00000 n \n`;
  const trailer = `${xref}trailer\n<< /Size ${encryptObject + 1} /Root 1 0 R /Encrypt ${encryptObject} 0 R /ID [<${hex(fileId)}> <${hex(fileId)}>] >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  pieces.push(ascii(trailer));
  return { bytes: concat(...pieces), pageCount, rendererVersion: PROTECTED_PDF_RENDERER_VERSION,
    pageConfiguration: PROTECTED_PDF_PAGE_CONFIG, securityProfile: PROTECTED_PDF_SECURITY_PROFILE };
}

export function inspectProtectedPdf(bytes: Uint8Array) {
  const text = latin1.decode(bytes);
  const permission = Number(text.match(/\/P\s+(-?\d+)/)?.[1]);
  const pageCount = (text.match(/\/Type\s*\/Page\b/g) ?? []).length;
  return {
    encrypted: /\/Filter\s*\/Standard/.test(text) && /\/Encrypt\s+\d+\s+0\s+R/.test(text),
    revision: Number(text.match(/\/R\s+(\d+)/)?.[1]), permission, pageCount,
    printingAllowed: Boolean(permission & 4), editingBlocked: (permission & 8) === 0,
    copyingBlocked: (permission & 16) === 0, pageExtractionBlocked: (permission & 1024) === 0,
    embeddedFilePresent: /\/Type\s*\/EmbeddedFile/.test(text) && /\/EmbeddedFiles/.test(text),
    validEof: text.endsWith("%%EOF\n")
  };
}
import { layoutProtectedReportHtml } from "./protected-pdf-layout.ts";
