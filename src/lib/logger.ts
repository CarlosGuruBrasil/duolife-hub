import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: ['password', 'password_hash', 'token', 'authorization', 'headers.authorization'],
});
