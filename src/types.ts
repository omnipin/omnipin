import type { ReadStream } from 'node:fs'
import type { FileCandidate } from 'ipfs-unixfs-importer'

export interface FileEntry extends FileCandidate<ReadStream> {
  size: number
  path: string
}

type AuthArgs = {
  token: string
}

export type UploadArgs<T = object> = {
  name: string
  verbose?: boolean
  car: Blob
  cid: string
  first: boolean
  size: number
} & AuthArgs &
  T

export type PinArgs<T = object> = {
  cid: string
  name: string
  verbose?: boolean
  first?: boolean
} & AuthArgs &
  T

type UploadReturnType = {
  cid: string
  providers?: string[]
  status?: PinStatus
  rID?: string
}

export type PinFunction<T = Record<string, unknown>> = (
  args: PinArgs<T>,
) => Promise<UploadReturnType>

export type UploadFunction<T = Record<string, unknown>> = (
  args: UploadArgs<T>,
) => Promise<UploadReturnType>

export type PinStatus =
  | 'queued'
  | 'pinned'
  | 'failed'
  | 'unpinning'
  | 'unknown'
  | 'not pinned'

type StatusArgs<T> = {
  cid: string
  auth: Partial<AuthArgs>
  verbose?: boolean
} & T

export type StatusFunction<T = object> = (args: StatusArgs<T>) => Promise<{
  pin: PinStatus
}>

export type ChainName = 'mainnet' | 'sepolia'

export type SupportedMethods = 'pin' | 'upload' | 'both'
