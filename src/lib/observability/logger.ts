type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

function formatEntry(level: LogLevel, message: string, meta?: Record<string, unknown>): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };
}

export const logger = {
  debug(message: string, meta?: Record<string, unknown>) {
    if (process.env.NODE_ENV === 'production') return;
    console.debug(JSON.stringify(formatEntry('debug', message, meta)));
  },

  info(message: string, meta?: Record<string, unknown>) {
    console.info(JSON.stringify(formatEntry('info', message, meta)));
  },

  warn(message: string, meta?: Record<string, unknown>) {
    console.warn(JSON.stringify(formatEntry('warn', message, meta)));
  },

  error(message: string, meta?: Record<string, unknown>) {
    console.error(JSON.stringify(formatEntry('error', message, meta)));
  },
};
