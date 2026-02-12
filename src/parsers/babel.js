import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';

// Handle ESM/CJS interop for @babel/traverse
const traverse = _traverse.default || _traverse;

const BABEL_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts'];

export const isBabelParseable = (path) => {
  return BABEL_EXTENSIONS.some(ext => path.endsWith(ext));
};

const isPascalCase = (name) => {
  return /^[A-Z][a-zA-Z0-9]*$/.test(name);
};

const getReactHOCInfo = (node) => {
  if (node.type !== 'CallExpression') return null;

  const callee = node.callee;
  let hocType = null;

  if (callee.type === 'MemberExpression' &&
      callee.object?.name === 'React' &&
      callee.property?.name) {
    const method = callee.property.name;
    if (['forwardRef', 'memo', 'lazy'].includes(method)) {
      hocType = method;
    }
  }

  if (callee.type === 'Identifier') {
    const name = callee.name;
    if (['forwardRef', 'memo', 'lazy'].includes(name)) {
      hocType = name;
    }
  }

  if (!hocType) return null;

  const firstArg = node.arguments[0];
  let innerFn = null;

  if (firstArg?.type === 'ArrowFunctionExpression' ||
      firstArg?.type === 'FunctionExpression') {
    innerFn = firstArg;
  }

  return { type: hocType, innerFn };
};

const isCreateContext = (node) => {
  if (node.type !== 'CallExpression') return false;
  const callee = node.callee;

  if (callee.type === 'MemberExpression' &&
      callee.object?.name === 'React' &&
      callee.property?.name === 'createContext') {
    return true;
  }

  if (callee.type === 'Identifier' && callee.name === 'createContext') {
    return true;
  }

  return false;
};

const extractDependencyArray = (node) => {
  if (!node) return null;

  if (node.type === 'ArrayExpression') {
    return node.elements.map(el => {
      if (!el) return '?';
      if (el.type === 'Identifier') return el.name;
      if (el.type === 'MemberExpression') {
        const parts = [];
        let current = el;
        while (current.type === 'MemberExpression') {
          if (current.property?.name) {
            parts.unshift(current.property.name);
          }
          current = current.object;
        }
        if (current.type === 'Identifier') {
          parts.unshift(current.name);
        }
        return parts.join('.') || '?';
      }
      return '?';
    });
  }

  return '?';
};

const getParamsString = (params) => {
  return params.map(param => {
    if (param.type === 'Identifier') {
      const typeAnnotation = param.typeAnnotation?.typeAnnotation;
      const typeName = typeAnnotation ? `: ${getTypeName(typeAnnotation)}` : '';
      return `${param.name}${typeName}`;
    }
    if (param.type === 'AssignmentPattern') {
      const left = param.left;
      if (left.type === 'Identifier') {
        return `${left.name} = ...`;
      }
    }
    if (param.type === 'RestElement') {
      return `...${param.argument?.name || 'args'}`;
    }
    if (param.type === 'ObjectPattern') {
      return '{ ... }';
    }
    if (param.type === 'ArrayPattern') {
      return '[ ... ]';
    }
    return '?';
  }).join(', ');
};

const getTypeName = (typeAnnotation) => {
  if (!typeAnnotation) return 'any';
  switch (typeAnnotation.type) {
    case 'TSStringKeyword': return 'string';
    case 'TSNumberKeyword': return 'number';
    case 'TSBooleanKeyword': return 'boolean';
    case 'TSVoidKeyword': return 'void';
    case 'TSAnyKeyword': return 'any';
    case 'TSNullKeyword': return 'null';
    case 'TSUndefinedKeyword': return 'undefined';
    case 'TSArrayType': return `${getTypeName(typeAnnotation.elementType)}[]`;
    case 'TSTypeReference': return typeAnnotation.typeName?.name || 'unknown';
    case 'TSUnionType': return typeAnnotation.types.map(getTypeName).join(' | ');
    case 'TSFunctionType': return '(...) => ...';
    default: return 'unknown';
  }
};

const getReturnType = (node) => {
  const returnType = node.returnType?.typeAnnotation;
  return returnType ? `: ${getTypeName(returnType)}` : '';
};

export const extractSignatures = (code, filePath = '') => {
  const signatures = [];
  const isTypeScript = filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.mts') || filePath.endsWith('.cts');

  const plugins = [
    'jsx',
    isTypeScript && 'typescript',
    'classProperties',
    'decorators-legacy',
    'exportDefaultFrom',
    'optionalChaining',
    'nullishCoalescingOperator',
  ].filter(Boolean);

  let ast;
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins,
      errorRecovery: true,
    });
  } catch (error) {
    return signatures;
  }

  const seenNames = new Set();

  traverse(ast, {
    FunctionDeclaration(path) {
      const node = path.node;
      const name = node.id?.name;
      if (!name || seenNames.has(name)) return;
      seenNames.add(name);

      const params = getParamsString(node.params);
      const returnType = getReturnType(node);
      const async = node.async ? 'async ' : '';

      signatures.push({
        name,
        signature: `${async}function ${name}(${params})${returnType}`,
        line: node.loc?.start?.line || 0,
      });
    },

    VariableDeclarator(path) {
      const name = path.node.id?.name;
      if (!name || seenNames.has(name)) return;

      const init = path.node.init;
      if (!init) return;

      if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') {
        seenNames.add(name);
        const params = getParamsString(init.params);
        const returnType = getReturnType(init);
        const async = init.async ? 'async ' : '';

        signatures.push({
          name,
          signature: `${async}const ${name} = (${params})${returnType} => ...`,
          line: path.node.loc?.start?.line || 0,
        });
        return;
      }

      const hocInfo = getReactHOCInfo(init);
      if (hocInfo) {
        seenNames.add(name);
        let params = '?';
        if (hocInfo.innerFn) {
          params = getParamsString(hocInfo.innerFn.params);
        }
        signatures.push({
          name,
          signature: `const ${name} = ${hocInfo.type}((${params}) => ...)`,
          line: path.node.loc?.start?.line || 0,
        });
        return;
      }

      if (isCreateContext(init)) {
        seenNames.add(name);
        signatures.push({
          name,
          signature: `const ${name} = createContext(...)`,
          line: path.node.loc?.start?.line || 0,
        });
      }
    },
  });

  signatures.sort((a, b) => a.line - b.line);
  return signatures;
};

export const extractSkeleton = (code, filePath = '') => {
  const isTypeScript = filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.mts') || filePath.endsWith('.cts');

  const plugins = [
    'jsx',
    isTypeScript && 'typescript',
    'classProperties',
    'decorators-legacy',
    'exportDefaultFrom',
    'optionalChaining',
    'nullishCoalescingOperator',
  ].filter(Boolean);

  let ast;
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins,
      errorRecovery: true,
    });
  } catch (error) {
    return null;
  }

  const skeleton = {
    imports: [],
    exports: [],
    components: [],
    functions: [],
    hooks: { useState: 0, useEffect: [], useCallback: 0, useMemo: 0, useRef: 0, custom: [] },
    constants: 0,
    classes: [],
    interfaces: [],
    types: [],
  };

  traverse(ast, {
    ImportDeclaration(path) {
      const source = path.node.source.value;
      const specifiers = path.node.specifiers.map(s => {
        if (s.type === 'ImportDefaultSpecifier') return s.local.name;
        if (s.type === 'ImportNamespaceSpecifier') return `* as ${s.local.name}`;
        return s.imported?.name || s.local.name;
      });
      skeleton.imports.push({ source, specifiers });
    },

    ExportDefaultDeclaration(path) {
      const decl = path.node.declaration;
      if (decl.type === 'Identifier') {
        skeleton.exports.push({ name: decl.name, type: 'default' });
      } else if (decl.type === 'FunctionDeclaration' && decl.id) {
        skeleton.exports.push({ name: decl.id.name, type: 'default' });
      }
    },

    ExportNamedDeclaration(path) {
      if (path.node.declaration) {
        const decl = path.node.declaration;
        if (decl.type === 'FunctionDeclaration' && decl.id) {
          skeleton.exports.push({ name: decl.id.name, type: 'named' });
        } else if (decl.type === 'VariableDeclaration') {
          decl.declarations.forEach(d => {
            if (d.id?.name) {
              skeleton.exports.push({ name: d.id.name, type: 'named' });
            }
          });
        }
      }
      if (path.node.specifiers) {
        path.node.specifiers.forEach(s => {
          skeleton.exports.push({ name: s.exported?.name || s.local.name, type: 'named' });
        });
      }
    },

    FunctionDeclaration(path) {
      const name = path.node.id?.name;
      if (!name) return;

      if (isPascalCase(name)) {
        skeleton.components.push({ name, line: path.node.loc?.start?.line || 0 });
      } else {
        skeleton.functions.push({ name, line: path.node.loc?.start?.line || 0 });
      }
    },

    VariableDeclarator(path) {
      const name = path.node.id?.name;
      const init = path.node.init;
      if (!name || !init) return;

      if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') {
        if (isPascalCase(name)) {
          skeleton.components.push({ name, line: path.node.loc?.start?.line || 0 });
        } else {
          skeleton.functions.push({ name, line: path.node.loc?.start?.line || 0 });
        }
        return;
      }

      const hocInfo = getReactHOCInfo(init);
      if (hocInfo) {
        skeleton.components.push({ name, line: path.node.loc?.start?.line || 0, hoc: hocInfo.type });
        return;
      }

      if (isCreateContext(init)) {
        skeleton.contexts = skeleton.contexts || [];
        skeleton.contexts.push({ name, line: path.node.loc?.start?.line || 0 });
        return;
      }

      skeleton.constants++;
    },

    CallExpression(path) {
      const callee = path.node.callee;
      if (callee.type === 'Identifier' && callee.name.startsWith('use')) {
        const hookName = callee.name;
        const line = path.node.loc?.start?.line || 0;

        if (hookName === 'useEffect') {
          const deps = extractDependencyArray(path.node.arguments[1]);
          skeleton.hooks.useEffect.push({ line, deps });
        } else if (skeleton.hooks[hookName] !== undefined) {
          skeleton.hooks[hookName]++;
        } else {
          if (!skeleton.hooks.custom.includes(hookName)) {
            skeleton.hooks.custom.push(hookName);
          }
        }
      }
    },

    ClassDeclaration(path) {
      const name = path.node.id?.name;
      if (name) {
        skeleton.classes.push({ name, line: path.node.loc?.start?.line || 0 });
      }
    },

    TSInterfaceDeclaration(path) {
      const name = path.node.id?.name;
      if (name) {
        skeleton.interfaces.push({ name, line: path.node.loc?.start?.line || 0 });
      }
    },

    TSTypeAliasDeclaration(path) {
      const name = path.node.id?.name;
      if (name) {
        skeleton.types.push({ name, line: path.node.loc?.start?.line || 0 });
      }
    },
  });

  return skeleton;
};

export const formatSignaturesForPrompt = (signatures) => {
  if (!signatures || signatures.length === 0) return '';
  return signatures.map(s => `    ${s.signature}  // line ${s.line}`).join('\n');
};

export const formatSkeletonForPrompt = (skeleton) => {
  if (!skeleton) return '';

  const lines = [];

  if (skeleton.imports.length > 0) {
    const local = skeleton.imports.filter(i => i.source.startsWith('.'));
    const extCount = skeleton.imports.length - local.length;
    const parts = [];
    if (extCount > 0) parts.push(`${extCount} ext`);
    parts.push(...local.map(i => i.source));
    lines.push(`imports: ${parts.join(', ')}`);
  }

  if (skeleton.exports.length > 0) {
    const exportNames = skeleton.exports.map(e => e.type === 'default' ? `${e.name}*` : e.name).join(', ');
    lines.push(`exports: ${exportNames}`);
  }

  if (skeleton.components.length > 0) {
    const componentList = skeleton.components.map(c => c.hoc ? `${c.name}(${c.hoc}):${c.line}` : `${c.name}:${c.line}`).join(', ');
    lines.push(`components: ${componentList}`);
  }

  if (skeleton.contexts?.length > 0) {
    lines.push(`contexts: ${skeleton.contexts.map(c => `${c.name}:${c.line}`).join(', ')}`);
  }

  if (skeleton.functions.length > 0) {
    lines.push(`fn: ${skeleton.functions.map(f => `${f.name}:${f.line}`).join(', ')}`);
  }

  const hookParts = [];
  if (skeleton.hooks.useState > 0) hookParts.push(`useState(${skeleton.hooks.useState})`);
  if (skeleton.hooks.useCallback > 0) hookParts.push(`useCallback(${skeleton.hooks.useCallback})`);
  if (skeleton.hooks.useMemo > 0) hookParts.push(`useMemo(${skeleton.hooks.useMemo})`);
  if (skeleton.hooks.useRef > 0) hookParts.push(`useRef(${skeleton.hooks.useRef})`);
  if (skeleton.hooks.custom.length > 0) hookParts.push(...skeleton.hooks.custom);

  if (skeleton.hooks.useEffect.length > 0) {
    const effects = skeleton.hooks.useEffect.map(eff => {
      if (eff.deps === null) return `useEffect(∞):${eff.line}`;
      if (eff.deps === '?') return `useEffect(?):${eff.line}`;
      return `useEffect([${eff.deps.join(',')}]):${eff.line}`;
    });
    hookParts.push(...effects);
  }

  if (hookParts.length > 0) {
    lines.push(`hooks: ${hookParts.join(', ')}`);
  }

  if (skeleton.classes.length > 0) {
    lines.push(`classes: ${skeleton.classes.map(c => `${c.name}:${c.line}`).join(', ')}`);
  }

  if (skeleton.interfaces.length > 0 || skeleton.types.length > 0) {
    const typeNames = [...skeleton.interfaces, ...skeleton.types].map(t => `${t.name}:${t.line}`).join(', ');
    lines.push(`types: ${typeNames}`);
  }

  return lines.join('\n');
};
