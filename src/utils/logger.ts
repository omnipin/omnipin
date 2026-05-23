import { isTTY } from '../constants.js'
import { styleText } from '../deps.js'
import type { SupportedMethods } from '../types.js'

const responseStatus = (status: number) => {
  if (status < 300) return styleText('bgGreen', status.toString())
  else if (status < 400) return styleText('bgYellow', status.toString())
  else return styleText('bgRed', status.toString())
}

export const logger = {
  start(...args: unknown[]) {
    console.log('📦', ...args)
  },
  info(...args: unknown[]) {
    console.info('🟢', ...args)
  },
  error(...args: unknown[]) {
    console.error('🚨', ...args)
  },
  warn(...args: unknown[]) {
    console.warn('⚠️', ...args)
  },
  success(...args: unknown[]) {
    console.log('✔', ...args)
  },
  request(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    status: number,
  ) {
    if (isTTY)
      console.log(
        '\n',
        method === 'GET'
          ? styleText('cyan', method)
          : styleText('green', method),
        url,
        responseStatus(status),
      )
    else console.log('\n', method, url, status)
  },
  text(...args: unknown[]) {
    console.log(...args)
  },
}

export const deployMessage = (provider: string, supports: SupportedMethods) => {
  switch (supports) {
    case 'pin':
      return `📌 to ${provider}`
    case 'upload':
      return `💾 to ${provider}`
    case 'both':
      return `💾 and 📌 to ${provider}`
  }
}
