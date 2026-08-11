export type ProtectedPdfLayoutPage = { commands: string[] };

type Block =
  | { kind: "HEADING"; level: 1 | 2 | 3; text: string }
  | { kind: "TEXT"; text: string; tone: "BODY" | "NOTICE" | "MUTED" }
  | { kind: "TABLE"; headers: string[]; rows: string[][] }
  | { kind: "GRAPH"; element: string; extension: number; balance: number; exhaustion: number; bars: Array<{ label: string; value: number }> };

const PAGE_TOP = 782;
const PAGE_BOTTOM = 52;
const LEFT = 50;
const WIDTH = 495;

function pdfString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[\r\n]/g, " ");
}

function decodeHtml(value: string) {
  return value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/â€”|â€“|—|–/g, "-").replace(/â‚¹|₹/g, "INR ").replace(/Â°|°/g, " degrees")
    .replace(/Â·|·|•/g, "-").replace(/[\u0080-\uffff]/g, "?")
    .replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

function attribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`, "i"));
  return decodeHtml(match?.[1] ?? "");
}

function parseTable(html: string): Extract<Block, { kind: "TABLE" }> {
  const rowMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const rows = rowMatches.map((match) => [...match[1].matchAll(/<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi)].map((cell) => decodeHtml(cell[2])));
  const headers = rows.shift() ?? [];
  return { kind: "TABLE", headers, rows: rows.filter((row) => row.length) };
}

function parseGraph(html: string): Extract<Block, { kind: "GRAPH" }> {
  const openingTag = html.match(/^<figure[^>]*>/i)?.[0] ?? "";
  const bars = attribute(openingTag, "data-bars").split("|").filter(Boolean).map((entry) => {
    const [label, rawValue] = entry.split(":");
    return { label: label || "?", value: Number(rawValue) };
  }).filter((entry) => Number.isFinite(entry.value));
  return {
    kind: "GRAPH", element: attribute(openingTag, "data-element") || "Element",
    extension: Number(attribute(openingTag, "data-extension")), balance: Number(attribute(openingTag, "data-balance")),
    exhaustion: Number(attribute(openingTag, "data-exhaustion")), bars
  };
}

function parseBlocks(html: string) {
  const body = html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "").replace(/<button[\s\S]*?<\/button>/gi, "");
  const tokenPattern = /<figure\s+class="shakti-graph"[\s\S]*?<\/figure>|<table[^>]*>[\s\S]*?<\/table>|<h1[^>]*>[\s\S]*?<\/h1>|<h2[^>]*>[\s\S]*?<\/h2>|<h3[^>]*>[\s\S]*?<\/h3>|<p[^>]*>[\s\S]*?<\/p>|<div[^>]*>[\s\S]*?<\/div>/gi;
  const blocks: Block[] = [];
  for (const match of body.matchAll(tokenPattern)) {
    const token = match[0];
    if (/^<figure/i.test(token)) { blocks.push(parseGraph(token)); continue; }
    if (/^<table/i.test(token)) { blocks.push(parseTable(token)); continue; }
    const tag = token.match(/^<(h1|h2|h3|p|div)/i)?.[1]?.toLowerCase();
    const text = decodeHtml(token);
    if (!text) continue;
    if (tag === "h1" || tag === "h2" || tag === "h3") blocks.push({ kind: "HEADING", level: Number(tag[1]) as 1 | 2 | 3, text });
    else blocks.push({ kind: "TEXT", text, tone: /class="[^"]*(notice|summary|evidence)/i.test(token) ? "NOTICE" : /class="[^"]*muted/i.test(token) ? "MUTED" : "BODY" });
  }
  return blocks;
}

function wrap(value: string, widthPoints: number, fontSize: number) {
  const maxChars = Math.max(8, Math.floor(widthPoints / (fontSize * 0.51)));
  const output: string[] = [];
  for (const paragraph of value.split("\n")) {
    let remaining = paragraph.trim();
    if (!remaining) { output.push(""); continue; }
    while (remaining.length > maxChars) {
      let at = remaining.lastIndexOf(" ", maxChars);
      if (at < Math.floor(maxChars * 0.55)) at = maxChars;
      output.push(remaining.slice(0, at).trim());
      remaining = remaining.slice(at).trimStart();
    }
    output.push(remaining);
  }
  return output;
}

export function layoutProtectedReportHtml(html: string) {
  const pages: ProtectedPdfLayoutPage[] = [{ commands: [] }];
  let y = PAGE_TOP;
  const current = () => pages[pages.length - 1];
  const newPage = () => { pages.push({ commands: [] }); y = PAGE_TOP; };
  const ensure = (height: number) => { if (y - height < PAGE_BOTTOM) newPage(); };
  const text = (value: string, x: number, baseline: number, size: number, bold = false, colour = "0.15 0.15 0.15") => {
    current().commands.push(`${colour} rg BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${baseline} Td (${pdfString(value)}) Tj ET`);
  };
  const addLines = (lines: string[], options: { x?: number; width?: number; size?: number; leading?: number; bold?: boolean; colour?: string } = {}) => {
    const x = options.x ?? LEFT; const width = options.width ?? WIDTH; const size = options.size ?? 9.2; const leading = options.leading ?? 12.5;
    for (const sourceLine of lines) for (const line of wrap(sourceLine, width, size)) {
      ensure(leading); text(line, x, y, size, options.bold, options.colour); y -= leading;
    }
  };

  const drawTableHeader = (headers: string[], widths: number[]) => {
    const wrapped = headers.map((cell, index) => wrap(cell, widths[index] - 8, 7.4));
    const height = Math.max(...wrapped.map((lines) => lines.length), 1) * 9 + 8;
    ensure(height + 4);
    let x = LEFT;
    headers.forEach((_, index) => {
      current().commands.push(`0.93 0.91 0.87 rg ${x} ${y - height + 3} ${widths[index]} ${height} re f 0.76 0.72 0.66 RG 0.5 w ${x} ${y - height + 3} ${widths[index]} ${height} re S`);
      wrapped[index].forEach((line, lineIndex) => text(line, x + 4, y - 8 - lineIndex * 9, 7.4, true));
      x += widths[index];
    });
    y -= height;
  };

  const drawCompactTable = (headers: string[], rows: string[][]) => {
    const maxima = headers.map((header, index) => Math.min(32, Math.max(8, header.length, ...rows.map((row) => row[index]?.length ?? 0))));
    const total = maxima.reduce((sum, value) => sum + value, 0);
    const widths = maxima.map((value) => WIDTH * value / total);
    drawTableHeader(headers, widths);
    for (const row of rows) {
      const wrapped = headers.map((_, index) => wrap(row[index] ?? "", widths[index] - 8, 7.2));
      const height = Math.max(...wrapped.map((lines) => lines.length), 1) * 9 + 8;
      if (y - height < PAGE_BOTTOM) {
        newPage();
        text(`Continued - ${headers[0] ?? "table"} records`, LEFT, y, 9.2, true, "0.34 0.25 0.14"); y -= 18;
        drawTableHeader(headers, widths);
      }
      let x = LEFT;
      headers.forEach((_, index) => {
        current().commands.push(`0.82 0.80 0.76 RG 0.45 w ${x} ${y - height + 3} ${widths[index]} ${height} re S`);
        wrapped[index].forEach((line, lineIndex) => text(line, x + 4, y - 8 - lineIndex * 9, 7.2));
        x += widths[index];
      });
      y -= height;
    }
    y -= 8;
  };

  const drawRecordCards = (headers: string[], rows: string[][]) => {
    for (const row of rows) {
      const title = `${headers[0] ?? "Record"}: ${row[0] ?? "Not recorded"}`;
      const fields = headers.slice(1).map((header, index) => ({ header, lines: wrap(row[index + 1] ?? "Not recorded", WIDTH - 126, 7.6) }));
      const height = 24 + fields.reduce((sum, field) => sum + Math.max(1, field.lines.length) * 9.2 + 3, 0);
      if (y - Math.min(height, PAGE_TOP - PAGE_BOTTOM) < PAGE_BOTTOM) {
        newPage();
        text(`Continued - ${headers[0] ?? "reference"} records`, LEFT, y, 9.2, true, "0.34 0.25 0.14"); y -= 20;
      }
      const top = y;
      current().commands.push(`0.98 0.97 0.94 rg ${LEFT} ${y - height + 5} ${WIDTH} ${height} re f 0.76 0.70 0.60 RG 0.6 w ${LEFT} ${y - height + 5} ${WIDTH} ${height} re S`);
      text(title, LEFT + 8, y - 13, 8.8, true, "0.34 0.25 0.14"); y -= 24;
      for (const field of fields) {
        text(field.header, LEFT + 8, y, 7.4, true, "0.38 0.38 0.38");
        field.lines.forEach((line, index) => text(line, LEFT + 118, y - index * 9.2, 7.6));
        y -= Math.max(1, field.lines.length) * 9.2 + 3;
      }
      y = top - height - 7;
    }
  };

  const drawGraph = (block: Extract<Block, { kind: "GRAPH" }>) => {
    const height = 190; ensure(height);
    const chartLeft = LEFT + 38; const chartWidth = WIDTH - 58; const chartBottom = y - 156; const chartHeight = 120;
    const values = [block.extension, block.balance, block.exhaustion, ...block.bars.map((bar) => bar.value)].filter(Number.isFinite);
    const max = Math.max(1, ...values) * 1.12;
    text(`${block.element} energy graph`, LEFT, y, 11, true, "0.34 0.25 0.14");
    const line = (value: number, colour: string, label: string) => {
      const lineY = chartBottom + (value / max) * chartHeight;
      current().commands.push(`${colour} RG 1.2 w ${chartLeft} ${lineY} m ${chartLeft + chartWidth} ${lineY} l S`);
      text(`${label} ${value}`, chartLeft + 3, lineY + 3, 6.8, true, colour);
    };
    line(block.extension, "0.64 0.18 0.15", "Extension"); line(block.balance, "0.10 0.10 0.10", "Balance"); line(block.exhaustion, "0.15 0.34 0.58", "Exhaustion");
    const count = Math.max(1, block.bars.length); const slot = chartWidth / count; const barWidth = Math.min(42, slot * 0.55);
    block.bars.forEach((bar, index) => {
      const barHeight = Math.max(1, (bar.value / max) * chartHeight); const x = chartLeft + index * slot + (slot - barWidth) / 2;
      current().commands.push(`0.69 0.55 0.34 rg ${x} ${chartBottom} ${barWidth} ${barHeight} re f`);
      text(String(bar.value), x + 3, chartBottom + barHeight + 3, 7.2, true);
      text(bar.label, x + 2, chartBottom - 11, 7.2, true);
    });
    current().commands.push(`0.35 0.35 0.35 RG 0.6 w ${chartLeft} ${chartBottom} m ${chartLeft + chartWidth} ${chartBottom} l S`);
    y -= height;
  };

  for (const block of parseBlocks(html)) {
    if (block.kind === "HEADING") {
      const size = block.level === 1 ? 16 : block.level === 2 ? 12.5 : 10;
      const leading = block.level === 1 ? 23 : block.level === 2 ? 19 : 15;
      ensure(leading + (block.level === 2 ? 90 : 18)); y -= block.level === 1 ? 2 : 7;
      addLines([block.text], { size, leading, bold: true, colour: block.level === 2 ? "0.34 0.25 0.14" : "0.12 0.12 0.12" });
      if (block.level === 2) current().commands.push(`0.69 0.55 0.34 RG 0.7 w ${LEFT} ${y + 4} m ${LEFT + WIDTH} ${y + 4} l S`);
      y -= 4;
    } else if (block.kind === "TEXT") {
      const lines = block.text.split("\n"); const lineCount = lines.flatMap((line) => wrap(line, block.tone === "NOTICE" ? WIDTH - 20 : WIDTH, 8.8)).length;
      const height = lineCount * 12 + (block.tone === "NOTICE" ? 16 : 6); ensure(height);
      if (block.tone === "NOTICE") current().commands.push(`0.98 0.97 0.94 rg ${LEFT} ${y - height + 5} ${WIDTH} ${height} re f 0.69 0.55 0.34 RG 2 w ${LEFT} ${y - height + 5} m ${LEFT} ${y + 5} l S`);
      if (block.tone === "NOTICE") y -= 6;
      addLines(lines, { x: block.tone === "NOTICE" ? LEFT + 10 : LEFT, width: block.tone === "NOTICE" ? WIDTH - 20 : WIDTH, size: 8.8, leading: 12, colour: block.tone === "MUTED" ? "0.38 0.38 0.38" : undefined });
      y -= block.tone === "NOTICE" ? 8 : 4;
    } else if (block.kind === "GRAPH") drawGraph(block);
    else if (block.headers.length <= 5) drawCompactTable(block.headers, block.rows);
    else drawRecordCards(block.headers, block.rows);
  }
  return pages.filter((page) => page.commands.length);
}
