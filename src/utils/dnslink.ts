import { CLOUDFLARE_API_URL } from '../constants.js'
import { DnsLinkError, MissingDnsLinkError } from '../errors.js'
import { logger } from './logger.js'

export const updateDnsLink = async ({
  cid,
  zoneId,
  apiKey,
  name,
  verbose,
}: {
  cid: string
  zoneId: string
  apiKey: string
  name: string
  verbose: boolean
}): Promise<{
  errors: { message: string; code: number }[]
  result: { name: string; dnslink: string }
}> => {
  const res = await fetch(
    `${CLOUDFLARE_API_URL}/zones/${zoneId}/web3/hostnames`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  )
  if (verbose) logger.request('GET', res.url, res.status)
  const json = (await res.json()) as {
    result: { name: string; id: string }[]
    errors: { message: string; code: number }[]
  }

  if (!res.ok) throw new DnsLinkError(json.errors[0].message)

  if (!json.result.length) throw new MissingDnsLinkError()

  const record = json.result.find((item) => name === item.name)

  if (!record) throw new MissingDnsLinkError()

  const res2 = await fetch(
    `${CLOUDFLARE_API_URL}/zones/${zoneId}/web3/hostnames/${record.id}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dnslink: `/ipfs/${cid}`,
        description: `Powered by Omnipin`,
      }),
    },
  )
  if (verbose) logger.request('POST', res.url, res.status)
  return res2.json()
}
