import type { DeployActionArgs } from './actions/deploy.js'
import type { EnsActionArgs } from './actions/ens.js'

export type ActionName = 'deploy' | 'ens' | 'pin' | 'dnslink'

export type ActionMap = {
  deploy: {
    args: { dir?: string; options: DeployActionArgs }
    result: {
      cid: string
      protocol: 'ipfs' | 'swarm'
      succeeded: string[]
      failed: Array<{ provider: string; error: Error }>
    }
  }
  ens: {
    args: { cid: string; domain: string; options: EnsActionArgs }
    result: { domain: string; txHash?: string; safeTxHash?: string }
  }
  pin: {
    args: {
      cid: string
      options: { providers?: string; strict?: boolean; verbose?: boolean }
    }
    result: {
      cid: string
      succeeded: string[]
      failed: Array<{ provider: string; error: Error }>
    }
  }
  dnslink: {
    args: { cid: string; name: string; options: { verbose?: boolean } }
    result: { name: string; dnslink: string }
  }
}

type MaybePromise<T> = T | Promise<T>

export type BeforeHook<A extends ActionName> = (
  ctx: ActionMap[A]['args'],
) => MaybePromise<ActionMap[A]['args'] | undefined>

export type AfterHook<A extends ActionName> = (
  ctx: ActionMap[A]['args'] & ActionMap[A]['result'],
) => MaybePromise<void>

export interface PluginAPI {
  before<A extends ActionName>(action: A, handler: BeforeHook<A>): void
  after<A extends ActionName>(action: A, handler: AfterHook<A>): void
}

export interface OmnipinPlugin {
  name: string
  setup: (api: PluginAPI) => void | Promise<void>
}
