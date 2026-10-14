import { Console } from 'node:console'
import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'

// Each test file runs in a child process that reports results to the runner
// over stdout, and other text on that pipe can corrupt the frames
// (https://github.com/nodejs/node/issues/64061). Log to stderr instead.
globalThis.console = new Console({
  stdout: process.stderr,
  stderr: process.stderr,
})

// Sources import each other as `./foo.js`, which tsc maps to `foo.ts`. Node
// strips types from `.ts` files but resolves specifiers as written, so point
// a relative `.js` import that has no `.js` file at the `.ts` file next to it.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier.startsWith('.') &&
      specifier.endsWith('.js') &&
      context.parentURL
    ) {
      const js = new URL(specifier, context.parentURL)
      const ts = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL)
      if (!existsSync(js) && existsSync(ts))
        return nextResolve(ts.href, context)
    }
    return nextResolve(specifier, context)
  },
})
