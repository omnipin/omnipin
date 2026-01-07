import type {
  AssertLocation,
  SpaceBlobAdd,
  SpaceBlobAddFailure,
  SpaceBlobAddSuccess,
  SpaceBlobGet,
  SpaceBlobGetFailure,
  SpaceBlobGetSuccess,
  SpaceBlobList,
  SpaceBlobListFailure,
  SpaceBlobListSuccess,
  SpaceBlobRemove,
  SpaceBlobRemoveFailure,
  SpaceBlobRemoveSuccess,
  SpaceBlobReplicate,
  SpaceBlobReplicateFailure,
  SpaceBlobReplicateSuccess,
  SpaceIndexAdd,
  SpaceIndexAddFailure,
  SpaceIndexAddSuccess,
  UCANConclude,
  UCANConcludeFailure,
  UCANConcludeSuccess,
  UploadAdd,
  UploadAddSuccess,
  UploadGet,
  UploadGetFailure,
  UploadGetSuccess,
  UploadList,
  UploadListSuccess,
  UploadRemove,
  UploadRemoveSuccess,
  UsageReport,
  UsageReportFailure,
  UsageReportSuccess,
} from '@storacha/capabilities/types'
import type { Delegation } from '@ucanto/core/delegation'
import type {
  DID,
  Failure,
  Link,
  MultihashDigest,
  Proof,
  Resource,
  ServiceMethod,
  Signer,
} from '@ucanto/interface'
import type { CAR } from '@ucanto/transport'
import type { Version } from 'multiformats'

/**
 * Agent metadata used to describe an agent ("audience")
 * with a more human and UI friendly data
 */
export interface AgentMeta {
  name: string
  description?: string
  url?: URL
  image?: URL
  type: 'device' | 'app' | 'service'
}

/**
 * Delegation metadata
 */
export interface DelegationMeta {
  /**
   * Audience metadata to be easier to build UIs with human readable data
   * Normally used with delegations issued to third parties or other devices.
   */
  audience?: AgentMeta
}

export interface Driver<T> {
  /**
   * Persist data to the driver's backend
   */
  save: (data: T) => Promise<void>
  /**
   * Loads data from the driver's backend
   */
  load: () => Promise<T | undefined>
}

/**
 * Space metadata
 */
export interface SpaceMeta {
  /**
   * Human readable name for the space
   */
  name: string
}

export type ResourceQuery = Resource | RegExp

export type Position = [offset: number, length: number]

export interface InvocationConfig {
  /**
   * Signing authority that is issuing the UCAN invocation(s).
   */
  issuer: Signer
  /**
   * The resource the invocation applies to.
   */
  with: DID
  /**
   * Proof(s) the issuer has the capability to perform the action.
   */
  proofs: Proof[]
}

export type SliceDigest = MultihashDigest

export interface Service {
  ucan: {
    conclude: ServiceMethod<
      UCANConclude,
      UCANConcludeSuccess,
      UCANConcludeFailure
    >
  }
  space: {
    blob: {
      add: ServiceMethod<SpaceBlobAdd, SpaceBlobAddSuccess, SpaceBlobAddFailure>
      remove: ServiceMethod<
        SpaceBlobRemove,
        SpaceBlobRemoveSuccess,
        SpaceBlobRemoveFailure
      >
      list: ServiceMethod<
        SpaceBlobList,
        SpaceBlobListSuccess,
        SpaceBlobListFailure
      >
      get: {
        0: {
          1: ServiceMethod<
            SpaceBlobGet,
            SpaceBlobGetSuccess,
            SpaceBlobGetFailure
          >
        }
      }
      replicate: ServiceMethod<
        SpaceBlobReplicate,
        SpaceBlobReplicateSuccess,
        SpaceBlobReplicateFailure
      >
    }
    index: {
      add: ServiceMethod<
        SpaceIndexAdd,
        SpaceIndexAddSuccess,
        SpaceIndexAddFailure
      >
    }
  }
  upload: {
    add: ServiceMethod<UploadAdd, UploadAddSuccess, Failure>
    get: ServiceMethod<UploadGet, UploadGetSuccess, UploadGetFailure>
    remove: ServiceMethod<UploadRemove, UploadRemoveSuccess, Failure>
    list: ServiceMethod<UploadList, UploadListSuccess, Failure>
  }
  usage: {
    report: ServiceMethod<UsageReport, UsageReportSuccess, UsageReportFailure>
  }
}
export interface BlobAddOk {
  site: Delegation<[AssertLocation]>
}

/**
 * Any IPLD link.
 */
export type AnyLink = Link<unknown, number, number, Version>

export type CARLink = Link<unknown, typeof CAR.codec.code>
