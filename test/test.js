import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { compactFile, compactProject } from '../src/index.js';
import { extractSkeleton as extractBabelSkeleton } from '../src/parsers/babel.js';
import { extractSkeleton as extractPythonSkeleton, formatSkeletonForPrompt as formatPythonSkeleton } from '../src/parsers/python.js';
import { collectFiles } from '../src/walker.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, 'fixtures');

describe('babel parser', () => {
  it('extracts skeleton from JS file', () => {
    const code = readFileSync(resolve(fixturesDir, 'sample.js'), 'utf-8');
    const skeleton = extractBabelSkeleton(code, 'sample.js');

    assert.ok(skeleton);
    assert.ok(skeleton.imports.length > 0);
    assert.ok(skeleton.components.length > 0);
    assert.ok(skeleton.functions.length > 0);
    assert.strictEqual(skeleton.hooks.useState, 1);
    assert.strictEqual(skeleton.hooks.useEffect.length, 1);
  });
});

describe('python parser', () => {
  it('extracts skeleton from Python file', () => {
    const code = readFileSync(resolve(fixturesDir, 'sample.py'), 'utf-8');
    const skeleton = extractPythonSkeleton(code, 'sample.py');

    assert.ok(skeleton);
    assert.strictEqual(skeleton.imports.length, 4);
    assert.strictEqual(skeleton.functions.length, 3);
    assert.strictEqual(skeleton.classes.length, 2);
    assert.ok(skeleton.constants >= 2);
  });

  it('parses decorators', () => {
    const code = readFileSync(resolve(fixturesDir, 'sample.py'), 'utf-8');
    const skeleton = extractPythonSkeleton(code, 'sample.py');

    const config = skeleton.classes.find(c => c.name === 'Config');
    assert.ok(config);
    assert.deepStrictEqual(config.decorators, ['dataclass']);
    assert.deepStrictEqual(config.bases, ['BaseProcessor']);

    const apiHandler = skeleton.functions.find(f => f.name === 'api_handler');
    assert.ok(apiHandler);
    assert.deepStrictEqual(apiHandler.decorators, ['app.route']);
  });

  it('formats skeleton', () => {
    const code = readFileSync(resolve(fixturesDir, 'sample.py'), 'utf-8');
    const skeleton = extractPythonSkeleton(code, 'sample.py');
    const output = formatPythonSkeleton(skeleton);

    assert.ok(output.includes('imports:'));
    assert.ok(output.includes('classes:'));
    assert.ok(output.includes('fn:'));
  });
});

describe('walker', () => {
  it('collects files from fixtures', () => {
    const files = collectFiles(fixturesDir);
    assert.ok(files.length >= 2);
    assert.ok(files.some(f => f.relativePath.endsWith('.js')));
    assert.ok(files.some(f => f.relativePath.endsWith('.py')));
  });
});

describe('compactFile', () => {
  it('compacts a JS file', () => {
    const code = readFileSync(resolve(fixturesDir, 'sample.js'), 'utf-8');
    const result = compactFile('sample.js', code);
    assert.ok(result.skeleton);
    assert.ok(result.formatted.length > 0);
  });

  it('compacts a Python file', () => {
    const code = readFileSync(resolve(fixturesDir, 'sample.py'), 'utf-8');
    const result = compactFile('sample.py', code);
    assert.ok(result.skeleton);
    assert.ok(result.formatted.length > 0);
  });
});

describe('compactProject', () => {
  it('compacts the fixtures directory', () => {
    const result = compactProject(fixturesDir);
    assert.ok(result.output.length > 0);
    assert.ok(result.output.includes('## sample.js'));
    assert.ok(result.output.includes('## sample.py'));
    assert.ok(result.stats.files >= 2);
    assert.ok(result.stats.rawTokens > 0);
    assert.ok(result.stats.compactedTokens > 0);
    assert.ok(result.stats.compactedTokens < result.stats.rawTokens);
  });
});
