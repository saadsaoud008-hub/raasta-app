import { setTimeout as delay } from 'node:timers/promises';

export async function runWorker(name, tick, close, logger = console) {
  const shutdown = new AbortController();
  const stop = () => shutdown.abort();
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  logger.log(JSON.stringify({ service: name, event: 'started' }));
  try {
    while (!shutdown.signal.aborted) {
      try {
        const worked = await tick(shutdown.signal);
        if (!worked) await delay(1000, undefined, { signal: shutdown.signal });
      } catch {
        if (shutdown.signal.aborted) break;
        // Avoid logging queue bodies, credentials, or connection strings.
        logger.error(JSON.stringify({ service: name, event: 'cycle_failed' }));
        await delay(2000, undefined, { signal: shutdown.signal }).catch(() => {});
      }
    }
  } finally {
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
    await close();
  }
}
