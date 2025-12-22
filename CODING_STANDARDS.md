# Coding Standards

This document defines the coding standards enforced in the CueSubmit Web project.

## ESLint / SonarLint Rules

### Regex Patterns

- Use `\w` instead of `[A-Za-z0-9_]`
- Use `\W` instead of `[^A-Za-z0-9_]`
- Use `\d` instead of `[0-9]`

```typescript
// ❌ Bad
const valid = /^[A-Za-z0-9_]+$/.test(input);

// ✅ Good
const valid = /^\w+$/.test(input);
```

### Array Access

- Use `.at(-1)` instead of `arr[arr.length - 1]`

```typescript
// ❌ Bad
const last = items[items.length - 1];

// ✅ Good
const last = items.at(-1);
```

### String Methods

- Use `.replaceAll()` instead of `.replace()` with global regex
- Use `RegExp.exec()` instead of `String.match()` when capturing groups

```typescript
// ❌ Bad
const clean = input.replace(/\s/g, "_");

// ✅ Good
const clean = input.replaceAll(/\s/g, "_");
```

### Number Parsing

- Use `Number.parseInt()` with explicit radix instead of `parseInt()`

```typescript
// ❌ Bad
const num = parseInt(str);

// ✅ Good
const num = Number.parseInt(str, 10);
```

### Sorting

- Use `.toSorted()` for immutable sorting
- Always provide comparison function for `.sort()`

```typescript
// ❌ Bad
const sorted = items.sort();

// ✅ Good
const sorted = items.toSorted((a, b) => a.localeCompare(b));
```

### React Component Props

- Wrap all component props with `Readonly<>`

```typescript
// ❌ Bad
function Button({ label }: { label: string }) { ... }

// ✅ Good
function Button({ label }: Readonly<{ label: string }>) { ... }
```

### Ternary Operators

- No nested ternaries - use logical AND or extract to variables
- Use `pluralize()` utility instead of inline ternary for pluralization

```typescript
// ❌ Bad
const label = count === 0 ? "none" : count === 1 ? "one" : "many";
const jobs = `${count} job${count !== 1 ? "s" : ""}`;

// ✅ Good
const label = count === 0 ? "none" : count === 1 ? "one" : "many"; // Extract to function
const jobs = `${count} ${pluralize("job", count)}`;
```

### Unused Variables

- Remove all unused variables and imports
- Use `_` prefix for intentionally unused parameters

```typescript
// ❌ Bad
const { errors, isValid } = useForm(); // errors never used

// ✅ Good
const { isValid } = useForm();
```

## TypeScript Standards

### React Types

- Use `React.ComponentRef` instead of deprecated `React.ElementRef`

```typescript
// ❌ Bad
type Ref = React.ElementRef<typeof Component>;

// ✅ Good
type Ref = React.ComponentRef<typeof Component>;
```

### Explicit Types

- Prefer explicit return types on exported functions
- Avoid implicit `any` - always type parameters and returns

## Markdown Standards (markdownlint)

### Spacing

- Blank line before and after headings
- Blank line before and after lists
- Blank line before and after tables
- Blank line before and after fenced code blocks

### Code Blocks

- Always specify language on fenced code blocks

````markdown
<!-- ❌ Bad -->
```
const x = 1;
```

<!-- ✅ Good -->
```typescript
const x = 1;
```
````

### Tables

- Use spaces around pipe separators
- Use spaces around dashes in separator row

```markdown
<!-- ❌ Bad -->
|Name|Value|
|---|---|

<!-- ✅ Good -->
| Name | Value |
| ---- | ----- |
```

## File Organization

### Imports Order

1. React/Next.js imports
2. Third-party library imports
3. Internal components (`@/components/`)
4. Internal utilities (`@/lib/`)
5. Types
6. Relative imports

### Component Structure

1. Type definitions
2. Constants
3. Helper functions
4. Main component
5. Sub-components (if colocated)

## Excluded Directories

The following directories are excluded from linting:

- `opencue/` - Reference codebase (not our code)
- `launcher/` - Native app launcher
- `scripts/` - Build/deployment scripts
- `.next/` - Next.js build output
- `node_modules/` - Dependencies

## Enforcement

These standards are enforced via:

- **ESLint** - `eslint.config.mjs`
- **SonarLint** - `sonar-project.properties`
- **markdownlint** - VS Code extension
- **TypeScript** - `tsconfig.json` strict mode
