/**
 * Simple retry utility with configurable retry attempts
 * @param fn - Function to retry
 * @param options - Retry options
 * @returns Promise that resolves with the function result or rejects after all retries
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    retries?: number
    onFailedAttempt?: (error: Error, attempt: number) => void
  } = {},
): Promise<T> {
  const { retries = 3, onFailedAttempt } = options

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt === retries) {
        throw error
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw error
      }

      // Call onFailedAttempt callback if provided
      if (onFailedAttempt && error instanceof Error) {
        onFailedAttempt(error, attempt)
      }
    }
  }

  throw new Error('Unexpected retry loop end')
}
