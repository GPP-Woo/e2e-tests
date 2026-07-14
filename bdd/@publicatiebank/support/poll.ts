import { isOdrc5xx } from './odrc'

/**
 * Retry `fn` while it fails with an ODRC 5xx, until it succeeds or `timeout`
 * elapses. The GPP-publicatiebank token API 500s intermittently while an admin
 * session is active on the same server (see `odrc.ts` / README "Known server
 * flake"); this rides that flake out for the publicatie/document lifecycle
 * scenarios (TS6–9) that read back through the API. Any non-5xx error (a real
 * 4xx, an assertion) propagates immediately.
 */
export interface WaitForOdrcOptions {
  /** Total time to keep retrying, ms. Default 30_000. */
  timeout?: number
  /** Delay between attempts, ms. Default 1_000. */
  interval?: number
}

export async function waitForOdrc<T>(fn: () => Promise<T>, options: WaitForOdrcOptions = {}): Promise<T> {
  const timeout = options.timeout ?? 30_000
  const interval = options.interval ?? 1_000
  const deadline = Date.now() + timeout

  while (true) {
    try {
      return await fn()
    }
    catch (err) {
      if (!isOdrc5xx(err) || Date.now() >= deadline)
        throw err
      await new Promise(resolve => setTimeout(resolve, interval))
    }
  }
}
