import { readdirSync } from 'fs';
import { join } from 'path';
import { isBabelParseable } from './parsers/babel.js';
import { isPythonParseable } from './parsers/python.js';

const SKIP_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  '.git',
  'target',
  'build',
  '.next',
  '.turbo',
  'out',
  'coverage',
  '.cache',
  '__pycache__',
  '.venv',
  'venv',
  '.idea',
  '.vscode',
]);

export function collectFiles(dir, rootDir = dir, files = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!SKIP_DIRS_OR_DOT(entry.name)) {
        collectFiles(fullPath, rootDir, files);
      }
    } else if (entry.isFile() && isParseable(fullPath)) {
      const relativePath = fullPath.slice(rootDir.length + 1);
      files.push({ path: fullPath, relativePath });
    }
  }

  return files;
}

function SKIP_DIRS_OR_DOT(name) {
  return SKIP_DIRECTORIES.has(name) || name.startsWith('.');
}

function isParseable(path) {
  return isBabelParseable(path) || isPythonParseable(path);
}
