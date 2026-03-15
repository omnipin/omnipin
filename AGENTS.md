# Omnipin Developer Guide

Guidelines for agentic coding agents operating in this repository.

---

## 1. Build, Lint, and Test Commands

```bash
bun install          # Install dependencies
bun run build       # Build with rslib to dist/
bun run types       # TypeScript type checking
bun run check       # Biome linter/formatter
bun run test:report # Run tests with coverage
bun test            # Run all tests
bun test path       # Run specific test file
bun test --env-file=.env.local path  # With env vars
```

---

## 2. Code Style Guidelines

### Formatting
- **Indent**: 2 spaces
- **Quotes**: Single quotes (`'`)
- **Semicolons**: As needed (Biome handles this)

### Imports
- Use explicit `.js` extensions for local imports: `import { foo } from './bar.js'`
- Group order: Node built-ins → External packages → Internal modules
- Use `import type` for type-only imports

### Types
- Use TypeScript for all new code
- Avoid `any` - use proper generic types
- Use `T = object` as default generic for provider configs
- CID values must be CIDv1 (`bafybe...`), never CIDv0 (`Qm...`)

### Naming Conventions
| Type | Convention | Example |
|------|------------|---------|
| Variables | camelCase | `providerName` |
| Constants | UPPER_SNAKE_CASE | `PROVIDERS` |
| Functions | camelCase | `pinOnAioz` |
| Classes | PascalCase | `DeployError` |
| Files | kebab-case | `aioz.ts` |

### Provider Function Naming
- `uploadOn{Provider}` - handles both upload and pin
- `pinOn{Provider}` - pin-only provider
- `statusOn{Provider}` - status check function

### Error Handling
Use custom error classes from `src/errors.ts`:
```typescript
throw new DeployError(providerName, errorMessage)
throw new UploadNotSupportedError(providerName)
throw new MissingKeyError('PROVIDER_KEY')
```

---

## 3. Writing Providers

Create provider file at `src/providers/ipfs/{provider}.ts`:

```typescript
import { DeployError, UploadNotSupportedError } from '../../errors.js'
import type { UploadFunction } from '../../types.js'

const providerName = 'ProviderName'

export const uploadOnProvider: UploadFunction = async ({
  first, token, verbose, name = '', cid
}) => {
  if (first) throw new UploadNotSupportedError(providerName)

  const res = await fetch('https://api.provider.example/pin', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ cid, name }),
  })

  if (verbose) logger.request('POST', res.url, res.status)

  const json = await res.json()
  if (!res.ok) {
    throw new DeployError(providerName, json.message || 'Pinning failed')
  }

  return { cid: json.data.cid }
}
```

Register in `src/constants.ts` with `{PROVIDER}_TOKEN` key:
```typescript
export const PROVIDERS = {
  PROVIDER_TOKEN: {
    name: 'ProviderName',
    upload: uploadOnProvider,
    supported: 'pin' | 'upload' | 'both',
    protocol: 'ipfs' | 'swarm',
  },
}
```

---

## 4. Tests

- Test files: `test/providers/<provider>.test.ts`
- Use `bun:test` framework
- Use CIDv1 for test CIDs (`bafybe...`)
- Skip live API tests if no token: use `it.skipIf()`

```typescript
import { describe, expect, it } from 'bun:test'
import { UploadNotSupportedError } from '../../src/errors.js'
import { pinOnProvider } from '../../src/providers/ipfs/provider.js'

const hasToken = Boolean(Bun.env.OMNIPIN_PROVIDER_TOKEN)

describe('ProviderName', () => {
  it('should throw if first provider', async () => {
    await expect(
      pinOnProvider({ first: true, token: 'key', cid: '...', name: 'test', car: new Blob(), size: 0 })
    ).rejects.toThrow(UploadNotSupportedError)
  })

  it.skipIf(!hasToken)('should pin successfully', async () => {
    // Live test
  }, { timeout: 30_000 })
})
```

---

## 5. Environment Variables

Tokens use prefix `OMNIPIN_`:
```
OMNIPIN_PINATA_TOKEN=xxx
OMNIPIN_AIOZ_TOKEN=api_key:api_secret
```

---

## 6. Project Structure

```
/src
  /actions        # CLI actions (deploy, pin, status)
  /providers/ipfs # IPFS providers (pinata, lighthouse, aioz)
  /providers/swarm# Swarm providers (bee, swarmy)
  /utils          # Utility functions
  constants.ts    # Provider registry
  errors.ts       # Custom error classes
  types.ts        # Core type definitions
  cli.ts          # CLI entry point

/test
  /providers      # Provider tests
  /utils          # Utility tests
dist/             # Build output
```

---

## 7. Key Patterns

### Supported Methods
- `pin` - Only pinning supported
- `upload` - Only upload supported
- `both` - Both upload and pin supported

### Token Parsing
Tokens are parsed in `src/utils/env.ts`. The `OMNIPIN_` prefix is stripped.

### Documentation
Use `context7` tools to search docs when needed.
