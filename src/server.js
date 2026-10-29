import { app } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';
import { logger } from './logger.js';

const server = app.listen(config.port, '0.0.0.0', () =>
  logger.info(`API listening on :${config.port} (${config.env})`));

// Graceful shutdown so deploys don't drop in-flight requests
const shutdown = (signal) => {
  logger.info({ signal }, 'shutting down');
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
