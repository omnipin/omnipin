import { DeployError, MissingKeyError } from '../../errors.js'
import type { PinFunction, PinStatus, StatusFunction } from '../../types.js'

const baseURL = 'https://ipfs.blockfrost.io/api/v0'
const providerName = 'Blockfrost'

export const pinOnBlockfrost: PinFunction = async ({ token, cid }) => {
  const res = await fetch(`${baseURL}/ipfs/pin/add/${cid}`, {
    method: 'POST',
    headers: {
      project_id: token,
    },
  })
  const json = await res.json()
  if (!res.ok) throw new DeployError(providerName, json.error.details)

  return {
    cid: json.ipfs_hash,
    status: json.state as 'queued',
  }
}

type Pin = {
  time_created: number
  time_pinned: number
  ipfs_hash: string
  size: string
  state: PinStatus
  filecoin: boolean
}

export const statusOnBlockfrost: StatusFunction = async ({
  auth: { token },
  cid,
}) => {
  if (!token) throw new MissingKeyError('BLOCKFROST_TOKEN')
  const res = await fetch(`${baseURL}/ipfs/pin/list/${cid}`, {
    method: 'GET',
    headers: {
      project_id: token,
    },
  })
  const json = await res.json()
  if (!res.ok) throw new DeployError(providerName, json.error.details)

  return {
    pin: (json as Pin).state,
    cid,
  }
}
