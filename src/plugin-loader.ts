import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { OmnipinPlugin } from './plugin.js'

export async function loadPlugin(specifier: string): Promise<OmnipinPlugin> {
  let mod: Record<string, unknown>

  try {
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
      const abs = resolve(process.cwd(), specifier)
      mod = await import(pathToFileURL(abs).href)
    } else {
      mod = await import(specifier)
    }
  } catch (e) {
    throw new Error(
      `Failed to load plugin "${specifier}": ${(e as Error).message}`,
      { cause: e },
    )
  }

  const plugin = (mod.default ?? mod) as OmnipinPlugin
  validatePlugin(plugin, specifier)
  return plugin
}

function validatePlugin(
  plugin: unknown,
  specifier: string,
): asserts plugin is OmnipinPlugin {
  if (!plugin || typeof plugin !== 'object')
    throw new Error(`Plugin "${specifier}" does not export an object`)
  if (
    !('name' in plugin) ||
    typeof (plugin as Record<string, unknown>).name !== 'string'
  )
    throw new Error(`Plugin "${specifier}" is missing a "name" string property`)
  if (
    !('setup' in plugin) ||
    typeof (plugin as Record<string, unknown>).setup !== 'function'
  )
    throw new Error(
      `Plugin "${(plugin as Record<string, unknown>).name}" is missing a "setup" function`,
    )
}
