import { beforeEach, describe, expect, it } from 'bun:test'
import type { OmnipinPlugin } from '../src/plugin.js'
import { loadPlugin } from '../src/plugin-loader.js'
import { PluginRegistry } from '../src/plugin-registry.js'

describe('Plugin System', () => {
  describe('PluginRegistry', () => {
    let registry: PluginRegistry

    beforeEach(() => {
      registry = new PluginRegistry()
    })

    it('should register and execute before hooks', async () => {
      let beforeCalled = false
      const testCtx = { cid: 'QmTest', options: {} }

      registry.before('pin', (ctx) => {
        beforeCalled = true
        expect(ctx).toEqual(testCtx)
        return ctx
      })

      const result = await registry.runBefore('pin', testCtx)
      expect(beforeCalled).toBeTrue()
      expect(result).toEqual(testCtx)
    })

    it('should register and execute after hooks', async () => {
      let afterCalled = false
      const testCtx = {
        cid: 'QmTest',
        options: {},
        succeeded: ['provider1'],
        failed: [],
      }

      registry.after('pin', (ctx) => {
        afterCalled = true
        expect(ctx).toEqual(testCtx)
      })

      await registry.runAfter('pin', testCtx)
      expect(afterCalled).toBeTrue()
    })

    it('should allow before hooks to modify context', async () => {
      const originalCtx = { cid: 'QmOriginal', options: {} }
      const expectedCtx = { cid: 'QmModified', options: {} }

      registry.before('pin', (ctx) => {
        return { ...ctx, cid: 'QmModified' }
      })

      const result = await registry.runBefore('pin', originalCtx)
      expect(result).toEqual(expectedCtx)
    })

    it('should execute multiple before hooks in order', async () => {
      const callOrder: string[] = []
      const testCtx = { cid: 'QmTest', options: {} }

      registry.before('pin', (ctx) => {
        callOrder.push('hook1')
        return ctx
      })

      registry.before('pin', (ctx) => {
        callOrder.push('hook2')
        return ctx
      })

      await registry.runBefore('pin', testCtx)
      expect(callOrder).toEqual(['hook1', 'hook2'])
    })

    it('should execute multiple after hooks in order', async () => {
      const callOrder: string[] = []
      const testCtx = {
        cid: 'QmTest',
        options: {},
        succeeded: [],
        failed: [],
      }

      registry.after('pin', (ctx) => {
        callOrder.push('hook1')
      })

      registry.after('pin', (ctx) => {
        callOrder.push('hook2')
      })

      await registry.runAfter('pin', testCtx)
      expect(callOrder).toEqual(['hook1', 'hook2'])
    })

    it('should support all action types', () => {
      const actions = ['pin', 'ens', 'deploy', 'dnslink'] as const

      actions.forEach((action) => {
        let hookCalled = false

        registry.before(action, (ctx) => {
          hookCalled = true
          return ctx
        })

        registry.after(action, (ctx) => {
          hookCalled = true
        })

        expect(() => {
          registry.runBefore(action, { cid: 'test', options: {} })
          registry.runAfter(action, {
            cid: 'test',
            options: {},
            succeeded: [],
            failed: [],
          })
        }).not.toThrow()

        expect(hookCalled).toBeTrue()
      })
    })
  })

  describe('Plugin Loading', () => {
    it('should load local plugin files', async () => {
      // Create a temporary test plugin
      const testPlugin: OmnipinPlugin = {
        name: 'test-plugin',
        setup: (api) => {
          api.before('pin', (ctx) => ctx)
        },
      }

      // Write temporary plugin file
      const tempPluginPath = './temp-test-plugin.js'
      await Bun.write(
        tempPluginPath,
        `
        export const testPlugin = {
          name: 'test-plugin',
          setup: (api) => {
            api.before('pin', (ctx) => ctx)
          }
        }
        export default testPlugin
      `,
      )

      try {
        const plugin = await loadPlugin(tempPluginPath)
        expect(plugin.name).toBe('test-plugin')
        expect(typeof plugin.setup).toBe('function')
      } finally {
        // Clean up
        await Bun.$`rm -f ${tempPluginPath}`
      }
    })

    it('should throw error for non-existent plugin', async () => {
      await expect(loadPlugin('./non-existent-plugin.js')).rejects.toThrow(
        /Failed to load plugin/,
      )
    })

    it('should throw error for invalid plugin structure', async () => {
      // Create an invalid plugin file
      const invalidPluginPath = './invalid-test-plugin.js'
      await Bun.write(
        invalidPluginPath,
        'export const invalid = "not a plugin"',
      )

      try {
        await expect(loadPlugin(invalidPluginPath)).rejects.toThrow(
          /is missing/,
        )
      } finally {
        // Clean up
        await Bun.$`rm -f ${invalidPluginPath}`
      }
    })
  })

  describe('Plugin Integration', () => {
    it('should integrate with example plugin', async () => {
      const registry = new PluginRegistry()

      // Load the example plugin
      const plugin = await loadPlugin('./example-plugin.js')
      await plugin.setup(registry)

      // Test that hooks were registered
      const testCtx = { cid: 'QmTest', options: {} }
      const result = await registry.runBefore('pin', testCtx)

      expect(result).toEqual(testCtx)
    })
  })
})
