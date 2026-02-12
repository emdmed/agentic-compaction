import { select, checkbox, Separator } from "@inquirer/prompts";
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { estimateTokens, formatTokenCount } from "./formatter.js";

function parseSections(text) {
  const sections = [];
  const parts = text.split(/^## /m);
  for (const part of parts) {
    if (!part.trim()) continue;
    const newlineIdx = part.indexOf("\n");
    const path = newlineIdx === -1 ? part.trim() : part.slice(0, newlineIdx).trim();
    const body = newlineIdx === -1 ? "" : part.slice(newlineIdx + 1);
    const fullContent = `## ${path}\n${body}`;
    const dir = dirname(path) === "." ? "/" : dirname(path);
    sections.push({
      path,
      dir,
      content: fullContent,
      tokens: estimateTokens(fullContent),
    });
  }
  return sections;
}

function getDateStamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

function findCompactedFiles(cwd) {
  return readdirSync(cwd)
    .filter((f) => f.startsWith("compacted_") && f.endsWith(".md") && !f.includes("_picked_"))
    .sort()
    .reverse();
}

export async function run() {
  const cwd = process.cwd();
  const files = findCompactedFiles(cwd);

  if (files.length === 0) {
    console.log("No compacted_*.md files found in current directory.");
    process.exit(1);
  }

  let filePath;
  if (files.length === 1) {
    filePath = files[0];
  } else {
    filePath = await select({
      message: "Select a compacted file:",
      choices: files.map((f) => ({ name: f, value: f })),
    });
  }

  const fileContent = readFileSync(join(cwd, filePath), "utf-8");
  const sections = parseSections(fileContent);

  // Build choices grouped by directory
  const choices = [];
  const dirsSeen = new Set();
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (!dirsSeen.has(s.dir)) {
      dirsSeen.add(s.dir);
      choices.push(new Separator(`── ${s.dir}/ ──`));
    }
    choices.push({
      name: `${s.path}  ~${formatTokenCount(s.tokens)}`,
      value: i,
      checked: true,
    });
  }

  const totalTokens = sections.reduce((sum, s) => sum + s.tokens, 0);
  const selected = await checkbox({
    message: `${filePath} — ${sections.length} sections ~${formatTokenCount(totalTokens)} tokens. Space to toggle, Enter to confirm:`,
    choices,
    pageSize: 30,
  });

  const enabledSections = selected.map((i) => sections[i]);
  const output = enabledSections.map((s) => s.content).join("");
  const baseName = filePath.replace(/\.md$/, "");
  const outName = `${baseName}_picked_${getDateStamp()}.md`;
  const outPath = join(cwd, outName);
  writeFileSync(outPath, output);

  const outTokens = enabledSections.reduce((sum, s) => sum + s.tokens, 0);
  console.log(`\nSaved to: ${outPath}`);
  console.log(`${enabledSections.length}/${sections.length} sections, ~${formatTokenCount(outTokens)} tokens`);
}
