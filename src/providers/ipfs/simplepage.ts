import { DeployError } from '../../errors.js'
import type { UploadFunction } from '../../types.js'

const providerName = 'SimplePage'

export const uploadToSimplePage: UploadFunction = async ({
  token,
  bytes,
  name,
}) => {
  const fd = new FormData()
  fd.append(
    'file',
    new File([bytes.buffer as ArrayBuffer], `${name}.car`, {
      type: 'application/vnd.ipld.car',
    }),
  )

  const res = await fetch(`https://simplepg.org/page?domain=${token}`, {
    body: fd,
    method: 'POST',
  })

  const json = await res.json()

  if (!res.ok) throw new DeployError(providerName, json.detail)

  return { cid: json.cid }
}
