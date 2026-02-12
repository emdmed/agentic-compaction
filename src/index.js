import { readFileSync } from 'fs';
import { collectFiles } from './walker.js';
import { formatOutput, estimateTokens } from './formatter.js';
import { isBabelParseable, extractSkeleton as extractBabelSkeleton, formatSkeletonForPrompt as formatBabelSkeleton } from './parsers/babel.js';
import { isPythonParseable, extractSkeleton as extractPythonSkeleton, formatSkeletonForPrompt as formatPythonSkeleton } from './parsers/python.js';

export { isBabelParseable } from './parsers/babel.js';
export { isPythonParseable } from './parsers/python.js';
export { estimateTokens, formatTokenCount } from './formatter.js';

/**
 * Compact a single file's content into a skeleton
 * @param {string} filePath - File path (used to determine parser)
 * @param {string} content - File content
 * @returns {{ skeleton: Object|null, formatted: string }}
 */
export function compactFile(filePath, content) {
  let skeleton = null;
  let formatted = '';

  if (isPythonParseable(filePath)) {
    skeleton = extractPythonSkeleton(content, filePath);
    formatted = skeleton ? formatPythonSkeleton(skeleton) : '';
  } else if (isBabelParseable(filePath)) {
    skeleton = extractBabelSkeleton(content, filePath);
    formatted = skeleton ? formatBabelSkeleton(skeleton) : '';
  }

  return { skeleton, formatted };
}

/**
 * Compact an entire project directory
 * @param {string} rootPath - Project root path
 * @param {Object} [options] - Options
 * @returns {{ output: string, stats: { files: number, rawTokens: number, compactedTokens: number } }}
 */
export function compactProject(rootPath, options = {}) {
  const files = collectFiles(rootPath);
  const results = [];
  let rawTokens = 0;

  for (const file of files) {
    try {
      const content = readFileSync(file.path, 'utf-8');
      rawTokens += estimateTokens(content);

      let skeleton = null;
      if (isPythonParseable(file.path)) {
        skeleton = extractPythonSkeleton(content, file.path);
      } else if (isBabelParseable(file.path)) {
        skeleton = extractBabelSkeleton(content, file.path);
      }

      results.push({
        relativePath: file.relativePath,
        skeleton,
      });
    } catch (error) {
      // Skip unreadable files
    }
  }

  const output = formatOutput(results);
  const compactedTokens = estimateTokens(output);

  return {
    output,
    stats: {
      files: results.length,
      rawTokens,
      compactedTokens,
    },
  };
}
