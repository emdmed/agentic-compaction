import { isPythonParseable } from './parsers/python.js';
import { formatSkeletonForPrompt as formatBabelSkeleton } from './parsers/babel.js';
import { formatSkeletonForPrompt as formatPythonSkeleton } from './parsers/python.js';

export const estimateTokens = (text) => {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
};

export const formatTokenCount = (count) => {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
};

export function formatOutput(results) {
  const lines = [];

  results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  for (const result of results) {
    lines.push(`## ${result.relativePath}`);

    if (result.skeleton) {
      const output = isPythonParseable(result.relativePath)
        ? formatPythonSkeleton(result.skeleton)
        : formatBabelSkeleton(result.skeleton);
      if (output) lines.push(output);
    }
  }

  return lines.join('\n');
}
