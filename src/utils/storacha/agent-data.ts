import type * as Ucanto from '@ucanto/interface'
import type { AgentMeta, DelegationMeta } from './types.js'

/**
 * Agent data that is safe to pass to structuredClone() and persisted by stores.
 */
export type AgentDataExport = {
  meta: AgentMeta
  principal: Ucanto.SignerArchive<Ucanto.DID, Ucanto.SigAlg>
  delegations: Map<
    string,
    {
      meta: DelegationMeta
      delegation: Array<{ cid: string; bytes: ArrayBuffer }>
    }
  >
}
