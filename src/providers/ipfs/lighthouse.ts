import { DeployError } from '../../errors.js'
import type { UnpinFunction, UploadFunction } from '../../types.js'
import { logger } from '../../utils/logger.js'

const providerName = 'Lighthouse'

export const uploadOnLighthouse: UploadFunction = async ({
  bytes,
  name,
  first,
  token,
  verbose,
  cid,
}) => {
  if (first) {
    const fd = new FormData()

    fd.append(
      'file',
      new Blob([bytes], { type: 'application/vnd.ipld.car' }),
      `${name}.car`,
    )

    const res = await fetch(
      'https://upload.lighthouse.storage/api/v0/dag/import',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: fd,
      },
    )

    if (verbose) logger.request('POST', res.url, res.status)

    const json = await res.json()

    if (!res.ok) {
      const message =
        json.error?.message ||
        json.error ||
        json.message ||
        json.details ||
        'Unknown error'
      throw new DeployError(providerName, message)
    }

    return { cid: json.data?.Hash || cid }
  }

  // Pin existing CID
  const res = await fetch('https://api.lighthouse.storage/api/lighthouse/pin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ cid }),
  })

  if (verbose) logger.request('POST', res.url, res.status)

  const json = await res.json()

  if (!res.ok) {
    const message =
      json.error?.message ||
      json.error ||
      json.message ||
      json.details ||
      'Unknown error'
    throw new DeployError(providerName, message)
  }

  return { cid, status: 'queued' }
}

type LighthouseFileEntry = {
  id: string
  cid: string
  fileName: string
  fileSizeInBytes: string
  createdAt: number
  lastUpdate: number
}

type LighthouseUploadsResponse = {
  fileList: LighthouseFileEntry[]
  totalFiles: number
}

const lighthouseListUploads = async (
  token: string,
  lastKey?: string,
): Promise<LighthouseUploadsResponse> => {
  const url = new URL('https://api.lighthouse.storage/api/user/files_uploaded')
  if (lastKey) url.searchParams.set('lastKey', lastKey)

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  return res.json()
}

export const unpinOnLighthouse: UnpinFunction = async ({ token, cid }) => {
  let lastKey: string | undefined

  for (let page = 0; page < 100; page++) {
    const json = await lighthouseListUploads(token, lastKey)
    const files = json.fileList ?? []

    for (const file of files) {
      if (file.cid === cid) {
        const del = await fetch(
          `https://api.lighthouse.storage/api/user/delete_file?id=${file.id}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          },
        )
        const delJson = await del.json()
        if (!del.ok) throw new DeployError(providerName, delJson.message)
        return { success: true, cid }
      }
    }

    if (files.length === 0) break
    lastKey = files[files.length - 1].id
  }

  throw new DeployError(providerName, `CID ${cid} not found`)
}
