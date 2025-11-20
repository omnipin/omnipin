import { setTimeout } from 'node:timers/promises'

type Payload = {
  txStatus: 'confirmed' | 'pending'
  dataSetId: number
  dataSetCreated: boolean
}

export const waitForDatasetReady = async (
  statusUrl: string,
): Promise<Payload> => {
  while (true) {
    const res = await fetch(statusUrl, { redirect: 'follow' })
    const json = (await res.json().catch(() => null)) as Payload

    if (!json || !json.txStatus) {
      throw new Error(`Invalid dataset status response:\n${await res.text()}`)
    }

    if (!json.dataSetCreated) {
      await setTimeout(3000)
      continue
    }

    if (json.txStatus === 'confirmed' && json.dataSetCreated) {
      return json
    }

    throw new Error(`Dataset creation failed: txStatus="${json.txStatus}"`)
  }
}
