# Omnipin Developer Guide

This file provides guidelines for agentic coding agents operating in this repository.

When you need to search docs, use `context7` tools.

---

## 1. Build, Lint, and Test Commands

### Running the Project

```bash
# Install dependencies
bun install

# Build the project
bun run build

# Run type checking
bun run types

# Run linting (Biome)
bun run check

# Run tests with coverage
bun run test:report

# Run all tests
bun test

# Run a single test file
bun test test/providers/aioz.test.ts

# Run tests with environment variables from .env.local
bun test --env-file=.env.local test/providers/aioz.test.ts
```

### Key Commands

| Command | Description |
|---------|-------------|
| `bun run build` | Builds with rslib to `dist/` |
| `bun run check` | Runs Biome linter/formatter |
| `bun run types` | TypeScript type checking |
| `bun test` | Run all tests |
| `bun test <path>` | Run specific test file |

---

## 2. Code Style Guidelines

### Formatting

- **Indent**: 2 spaces (no tabs)
- **Quotes**: Single quotes (`'`) for strings
- **Semicolons**: As needed (Biome handles this)
- **Line endings**: LF (handled by git)

### Imports

- Use explicit `.js` extensions for local imports: `import { foo } from './bar.js'`
- Group imports in this order:
  1. Node built-ins (`node:fs`)
  2. External packages
  3. Internal modules (`../../utils/logger.js`)
- Use `import type` for type-only imports

### Types

- Use TypeScript for all new code
- Avoid `any` - use proper generic types when possible
- Use `T = object` as default generic for flexible provider configs
- CID values must be CIDv1 (`bafybe...`), never CIDv0 (`Qm...`)

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Variables | camelCase | `providerName`, `apiTokens` |
| Constants | UPPER_SNAKE_CASE | `PROVIDERS`, `CLOUDFLARE_API_URL` |
| Functions | camelCase | `pinOnAioz`, `uploadOnLighthouse` |
| Classes | PascalCase | `DeployError`, `UploadNotSupportedError` |
| Files | kebab-case | `aioz.ts`, `pinata.ts` |
| Providers | Full name from docs | `Pinata`, `Lighthouse`, `AIOZ` |
| Provider env keys | `{PROVIDER}_TOKEN` | `PINATA_TOKEN`, `AIOZ_TOKEN` |

### Provider Function Naming

Provider upload/pin functions follow this pattern:
- `uploadOn{Provider}` - handles both upload and pin
- `pinOn{Provider}` - pin-only provider
- `statusOn{Provider}` - status check function

### Error Handling

Use custom error classes from `src/errors.ts`:

```typescript
// For provider failures
throw new DeployError(providerName, errorMessage)

// For unsupported operations
throw new UploadNotSupportedError(providerName)

// For missing configuration
throw new MissingKeyError('PROVIDER_KEY')
```

Error classes include `providerName` property for context.

### Writing Providers

When adding a new pinning provider:

1. **Create provider file**: `src/providers/ipfs/{provider}.ts`
2. **Export upload function**: `uploadOn{Provider}: UploadFunction`
3. **Handle first/last**: Throw `UploadNotSupportedError` if upload not supported
4. **Register in constants.ts**: Add to `PROVIDERS` object with `{PROVIDER}_TOKEN` key

Example structure:

```typescript
import { DeployError, UploadNotSupportedError } from '../../errors.js'
import type { UploadFunction } from '../../types.js'

const providerName = 'ProviderName'

export const uploadOnProvider: UploadFunction = async ({
  first,
  token,
  verbose,
  name = '',
  cid,
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

### Tests

- Test files go in `test/providers/`
- Use `bun:test` framework
- Test files: `<provider>.test.ts`
- Use CIDv1 for test CIDs (`bafybe...`)
- Skip live API tests if no token or account has no balance
- Use `it.skipIf()` for conditional test skipping

Example test pattern:

```typescript
import { describe, expect, it } from 'bun:test'
import { UploadNotSupportedError } from '../../src/errors.js'
import { pinOnProvider } from '../../src/providers/ipfs/provider.js'

const hasToken = Boolean(Bun.env.OMNIPIN_PROVIDER_TOKEN)

describe('ProviderName', () => {
  describe('pin', () => {
    it('should throw if first provider', async () => {
      await expect(
        pinOnProvider({ first: true, token: 'key', cid: '...', name: 'test', car: new Blob(), size: 0 })
      ).rejects.toThrow(UploadNotSupportedError)
    })

    it.skipIf(!hasToken)(
      'should pin a CID successfully',
      async () => {
        // Live test
      },
      { timeout: 30_000 },
    )
  })
})
```

---

## 3. Environment Variables

Tokens are read from environment with prefix `OMNIPIN_`:

```
OMNIPIN_PINATA_TOKEN=xxx
OMNIPIN_AIOZ_TOKEN=api_key:api_secret
```

The token key (e.g., `AIOZ_TOKEN`) maps to the provider in `PROVIDERS` object.

---

## 4. Project Structure

```
/src
  /actions        # CLI actions (deploy, pin, status, etc.)
  /providers
    /ipfs        # IPFS providers (pinata, lighthouse, aioz, etc.)
    /swarm       # Swarm providers (bee, swarmy)
  /utils         # Utility functions
  constants.ts   # Provider registry
  errors.ts      # Custom error classes
  types.ts       # Core type definitions
  cli.ts         # CLI entry point

/test
  /providers     # Provider tests
  /utils         # Utility tests

dist/            # Build output
```

---

## 5. Key Patterns

### Provider Registry

Providers are registered in `src/constants.ts`:

```typescript
export const PROVIDERS = {
  PROVIDER_TOKEN: {
    name: 'ProviderName',
    upload: uploadOnProvider,
    status?: statusOnProvider,  // optional
    supported: 'pin' | 'upload' | 'both',
    protocol: 'ipfs' | 'swarm',
  },
}
```

### Token Parsing

Tokens are parsed from `process.env` in `src/utils/env.ts`. The prefix `OMNIPIN_` is stripped.

### Supported Methods

- `pin` - Only pinning is supported (no upload)
- `upload` - Only upload is supported (no pin)
- `both` - Both upload and pin are supported
