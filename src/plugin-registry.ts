import type {
  ActionMap,
  ActionName,
  AfterHook,
  BeforeHook,
  PluginAPI,
} from './plugin.js'

export class PluginRegistry implements PluginAPI {
  private hooks = {
    deploy: {
      before: [] as BeforeHook<'deploy'>[],
      after: [] as AfterHook<'deploy'>[],
    },
    ens: {
      before: [] as BeforeHook<'ens'>[],
      after: [] as AfterHook<'ens'>[],
    },
    pin: {
      before: [] as BeforeHook<'pin'>[],
      after: [] as AfterHook<'pin'>[],
    },
    dnslink: {
      before: [] as BeforeHook<'dnslink'>[],
      after: [] as AfterHook<'dnslink'>[],
    },
  }

  before<A extends ActionName>(action: A, handler: BeforeHook<A>) {
    ;(this.hooks[action].before as unknown as BeforeHook<A>[]).push(handler)
  }

  after<A extends ActionName>(action: A, handler: AfterHook<A>) {
    ;(this.hooks[action].after as unknown as AfterHook<A>[]).push(handler)
  }

  async runBefore<A extends ActionName>(
    action: A,
    ctx: ActionMap[A]['args'],
  ): Promise<ActionMap[A]['args']> {
    let current = ctx
    for (const hook of this.hooks[action]
      .before as unknown as BeforeHook<A>[]) {
      const result = await hook(current)
      if (result !== undefined && result !== null) current = result
    }
    return current
  }

  async runAfter<A extends ActionName>(
    action: A,
    ctx: ActionMap[A]['args'] & ActionMap[A]['result'],
  ): Promise<void> {
    for (const hook of this.hooks[action].after as unknown as AfterHook<A>[]) {
      await hook(ctx)
    }
  }
}
