const PYTHON_EXTENSIONS = ['.py'];

export const isPythonParseable = (path) => {
  return PYTHON_EXTENSIONS.some(ext => path.endsWith(ext));
};

/**
 * Extract skeleton from Python source code using regex-based line-by-line parsing.
 * Only parses top-level statements (no indentation).
 * @param {string} code - Source code to parse
 * @param {string} filePath - File path for error reporting
 * @returns {Object|null} Skeleton data
 */
export const extractSkeleton = (code, filePath = '') => {
  const lines = code.split('\n');
  const skeleton = {
    imports: [],
    functions: [],
    classes: [],
    constants: [],
  };

  // Collect decorators as we scan
  let pendingDecorators = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Skip empty lines and comments
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue;

    // Only process top-level (no indentation)
    if (/^\s/.test(line) && !/^@/.test(line)) {
      pendingDecorators = [];
      continue;
    }

    // Decorators
    const decoratorMatch = line.match(/^@(\w[\w.]*)/);
    if (decoratorMatch) {
      pendingDecorators.push(decoratorMatch[1]);
      continue;
    }

    // import x / import x, y
    const importMatch = line.match(/^import\s+(.+)/);
    if (importMatch) {
      const modules = importMatch[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]);
      for (const mod of modules) {
        skeleton.imports.push({ module: mod, names: [] });
      }
      pendingDecorators = [];
      continue;
    }

    // from x import y, z
    const fromImportMatch = line.match(/^from\s+([\w.]+)\s+import\s+(.+)/);
    if (fromImportMatch) {
      const module = fromImportMatch[1];
      let namesStr = fromImportMatch[2].trim();

      // Handle multi-line imports with parentheses
      if (namesStr.startsWith('(')) {
        namesStr = namesStr.slice(1);
        while (i + 1 < lines.length && !namesStr.includes(')')) {
          i++;
          namesStr += ' ' + lines[i].trim();
        }
        namesStr = namesStr.replace(')', '');
      }

      const names = namesStr
        .split(',')
        .map(s => s.trim().split(/\s+as\s+/)[0])
        .filter(Boolean);

      skeleton.imports.push({ module, names });
      pendingDecorators = [];
      continue;
    }

    // async def / def
    const funcMatch = line.match(/^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/);
    if (funcMatch) {
      // For multi-line params, grab until closing paren
      let params = funcMatch[2];
      if (!line.includes(')')) {
        let j = i + 1;
        while (j < lines.length && !lines[j].includes(')')) {
          params += ' ' + lines[j].trim();
          j++;
        }
        if (j < lines.length) {
          params += ' ' + lines[j].split(')')[0].trim();
        }
      }
      // Clean up params: remove type annotations and defaults for brevity
      params = params.replace(/\s+/g, ' ').trim();

      skeleton.functions.push({
        name: funcMatch[1],
        line: lineNum,
        decorators: [...pendingDecorators],
        params,
      });
      pendingDecorators = [];
      continue;
    }

    // class Name(bases):
    const classMatch = line.match(/^class\s+(\w+)\s*(?:\(([^)]*)\))?\s*:/);
    if (classMatch) {
      const bases = classMatch[2]
        ? classMatch[2].split(',').map(s => s.trim()).filter(Boolean)
        : [];

      skeleton.classes.push({
        name: classMatch[1],
        line: lineNum,
        decorators: [...pendingDecorators],
        bases,
      });
      pendingDecorators = [];
      continue;
    }

    // Top-level assignments (constants)
    const assignMatch = line.match(/^([A-Za-z_]\w*)\s*[=:]/);
    if (assignMatch) {
      skeleton.constants.push(assignMatch[1]);
      pendingDecorators = [];
      continue;
    }

    // Reset decorators for any other top-level statement
    pendingDecorators = [];
  }

  return skeleton;
};

/**
 * Format Python skeleton for prompt output
 * @param {Object} skeleton - Skeleton data object
 * @returns {string}
 */
export const formatSkeletonForPrompt = (skeleton) => {
  if (!skeleton) return '';

  const lines = [];

  if (skeleton.imports.length > 0) {
    const local = skeleton.imports.filter(i => i.module.startsWith('.'));
    const extCount = skeleton.imports.length - local.length;
    const parts = [];
    if (extCount > 0) parts.push(`${extCount} ext`);
    parts.push(...local.map(i => i.module));
    lines.push(`imports: ${parts.join(', ')}`);
  }

  if (skeleton.classes.length > 0) {
    const classList = skeleton.classes.map(c => {
      const parts = [c.name];
      if (c.decorators.length > 0) parts.push(`@${c.decorators[0]}`);
      if (c.bases.length > 0) parts.push(`(${c.bases.join(',')})`);
      return `${parts.join(' ')}:${c.line}`;
    }).join(', ');
    lines.push(`classes: ${classList}`);
  }

  if (skeleton.functions.length > 0) {
    const funcList = skeleton.functions.map(f => {
      const deco = f.decorators.length > 0 ? `@${f.decorators[0]} ` : '';
      const params = f.params ? `(${f.params})` : '()';
      return `${deco}${f.name}${params}:${f.line}`;
    }).join(', ');
    lines.push(`fn: ${funcList}`);
  }

  if (skeleton.constants.length > 0) {
    const names = skeleton.constants;
    if (names.length > 5) {
      lines.push(`const: ${names.slice(0, 5).join(', ')} +${names.length - 5} more`);
    } else {
      lines.push(`const: ${names.join(', ')}`);
    }
  }

  return lines.join('\n');
};
