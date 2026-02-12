#!/usr/bin/env node

import { resolve, join, basename } from 'path';
import { writeFileSync } from 'fs';
import pc from 'picocolors';
import { compactProject } from './index.js';
import { formatTokenCount } from './formatter.js';

function getDateStamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

const args = process.argv.slice(2);

let targetPath = process.cwd();
let jsonOutput = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--json') {
    jsonOutput = true;
  } else if (arg === '--help' || arg === '-h') {
    console.log(`Usage: codebase-compact [path] [options]

Options:
  --json         Output as JSON instead of text
  --help, -h     Show this help message

Output is saved to compacted_<name>_<date>.md in the target directory.`);
    process.exit(0);
  } else if (!arg.startsWith('-')) {
    targetPath = arg;
  }
}

targetPath = resolve(targetPath);

const { output, stats } = compactProject(targetPath);

const dirName = basename(targetPath);
const filename = `compacted_${dirName}_${getDateStamp()}.md`;
const outputPath = join(targetPath, filename);

if (jsonOutput) {
  writeFileSync(outputPath, JSON.stringify({ output, stats }, null, 2));
} else {
  writeFileSync(outputPath, output);
}

const compactionRate = stats.rawTokens > 0
  ? ((1 - stats.compactedTokens / stats.rawTokens) * 100).toFixed(1)
  : '0';

console.log(`\n${pc.green('✔')} ${pc.bold('Compaction complete!')}\n`);
console.log(`  ${pc.dim('Saved to')} ${pc.cyan(outputPath)}\n`);
console.log(`  ${pc.dim('Files')}            ${pc.white(stats.files)}`);
console.log(`  ${pc.dim('Project tokens')}   ${pc.yellow(formatTokenCount(stats.rawTokens))}`);
console.log(`  ${pc.dim('Compacted tokens')} ${pc.green(formatTokenCount(stats.compactedTokens))}`);
console.log(`  ${pc.dim('Compaction rate')}  ${pc.bold(pc.green(compactionRate + '%'))}`);
