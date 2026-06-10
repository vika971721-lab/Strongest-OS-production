import 'dotenv/config';
import { createApplication } from './app.js';
import { parseEnv, toSafeEnvLogData } from './config/env.js';
import { logger, normalizeError } from './utils/logger.js';

const env = parseEnv(process.env);
logger.info({ env: toSafeEnvLogData(env) }, 'application_starting');

const app = createApplication(env);

let fatalExitCode = 0;
const shutdown = (signal: string, exitCode = fatalExitCode): void => {
  void app.shutdown(signal, exitCode).finally(() => {
    if (exitCode !== 0) process.exit(exitCode);
  });
};

process.once('SIGINT', (signal) => shutdown(signal));
process.once('SIGTERM', (signal) => shutdown(signal));

process.on('unhandledRejection', (reason) => {
  fatalExitCode = 1;
  logger.fatal({ err: normalizeError(reason) }, 'application_crashed');
  shutdown('unhandledRejection', 1);
});

process.on('uncaughtException', (error) => {
  fatalExitCode = 1;
  logger.fatal({ err: normalizeError(error) }, 'application_crashed');
  shutdown('uncaughtException', 1);
});

await app.start();
