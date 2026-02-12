# codebase-compact

Walks a project directory, parses JS/TS/Python files, and outputs a compact structural skeleton of the entire codebase. Designed for feeding project context into LLM prompts with minimal token usage.

Typical compaction rate: **~95%** token reduction.

## Install

```bash
npm install -g codebase-compact
```

Or run directly from the repo:

```bash
node src/cli.js /path/to/project
```

## CLI Usage

```bash
codebase-compact [path] [options]
```

**Options:**

| Flag | Description |
|------|-------------|
| `--json` | Save output as JSON (includes stats) |
| `--help`, `-h` | Show help |

If no path is given, it defaults to the current directory.

Output is saved to the target directory as `compacted_<project>_<date>.md`.

**Example:**

```bash
$ codebase-compact ~/projects/my-app

Saved to /home/user/projects/my-app/compacted_my-app_2026-02-12_15-30-00.md

  Files:            96
  Project tokens:   106.9K
  Compacted tokens: 5.9K
  Compaction rate:  94.4%
```

## Library Usage

```js
import { compactProject, compactFile } from 'codebase-compact';

// Compact an entire directory
const { output, stats } = compactProject('/path/to/project');
console.log(output);
console.log(stats); // { files, rawTokens, compactedTokens }

// Compact a single file
const { skeleton, formatted } = compactFile('app.tsx', sourceCode);
```

## Output Format

Each file is rendered as a markdown heading followed by its structural skeleton:

```
## src/components/App.jsx
imports: 3 ext, ./hooks/useAuth, ./api/client
exports: App*
components: App:12
fn: handleSubmit:24, validate:40
hooks: useState(2), useEffect([user]):18, useAuth
```

The skeleton captures:
- **Imports** (local paths shown, externals counted)
- **Exports** (default marked with `*`)
- **Components** (PascalCase functions, HOC-wrapped)
- **Functions** (with line numbers)
- **Hooks** (counts, useEffect deps, custom hooks)
- **Classes, interfaces, types** (TS)
- **Python**: imports, classes (with bases/decorators), functions, constants

## Supported Languages

| Language | Parser | Extensions |
|----------|--------|------------|
| JavaScript | `@babel/parser` | `.js`, `.jsx`, `.mjs`, `.cjs` |
| TypeScript | `@babel/parser` | `.ts`, `.tsx`, `.mts`, `.cts` |
| Python | Regex-based (zero deps) | `.py` |

## Skipped Directories

`node_modules`, `dist`, `.git`, `target`, `build`, `.next`, `.turbo`, `out`, `coverage`, `.cache`, `__pycache__`, `.venv`, `venv`, `.idea`, `.vscode`, and any dotfile directories.

## Project Structure

```
src/
  cli.js            # CLI entry point
  index.js          # Library API: compactProject, compactFile
  walker.js         # Recursive directory walker with filtering
  formatter.js      # Output formatting + token estimation
  parsers/
    babel.js        # JS/TS parsing via Babel AST
    python.js       # Python parsing via regex (top-level only)
```

## Tests

```bash
npm test
```

## License

MIT
