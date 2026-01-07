import { isTTY } from '../constants.js'
import { setTimeout, styleText } from '../deps.js'
import { logger } from '../utils/logger.js'

const gwOfflineMessage = `😞 Max retries exceeded. Gateway is ${isTTY ? styleText('bold', styleText('red', 'Offline')) : 'Offline'}.`

export const pingAction = async ({
  cid,
  endpoint,
  options,
}: {
  cid: string
  endpoint: string
  options: Partial<{
    maxRetries: number
    retryInterval: number
    timeout: number
  }>
}): Promise<void> => {
  const {
    maxRetries = Infinity,
    retryInterval = 5000,
    timeout = 10000,
  } = options

  const url = `https://${cid}.ipfs.${endpoint}`

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    logger.text(
      `${isTTY ? styleText('bold', `[${attempt}]`) : `[${attempt}]`}: Requesting content at ${url}`,
    )

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeout),
        redirect: 'follow',
      })

      if (response.status === 504) {
        if (attempt < maxRetries) {
          logger.text(`🔄 Retrying in ${retryInterval / 1000} seconds...`)
          await setTimeout(retryInterval)
        } else {
          return logger.error(gwOfflineMessage)
        }
      } else {
        return logger.text(
          `Gateway status: ${
            response.status >= 200 && response.status < 400
              ? isTTY
                ? styleText(
                    'bold',
                    styleText('green', `🟢 Online ${response.status}`),
                  )
                : `🟢 Online ${response.status}`
              : response.status
          }`,
        )
      }
    } catch (error) {
      if (error instanceof DOMException && attempt < maxRetries) {
        logger.info(`⌛ Timed out. Retrying...`)
        await setTimeout(retryInterval)
      } else {
        logger.error(
          error instanceof DOMException
            ? gwOfflineMessage
            : `Error fetching endpoint: ${(error as Error).message}`,
        )
        throw error
      }
    }
  }
}
