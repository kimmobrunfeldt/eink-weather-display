import { environment } from 'src/environment'

const transform =
  environment.NODE_ENV === 'development'
    ? (...args: any) => args
    : JSON.stringify

// https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#LogSeverity
export const logger = {
  debug: (message: string, extra: any = {}) =>
    console.error(...transform({ message, extra, severity: 'DEBUG' })),
  log: (message: string, extra: any = {}) =>
    console.error(...transform({ message, extra, severity: 'INFO' })),
  info: (message: string, extra: any = {}) =>
    console.error(...transform({ message, extra, severity: 'INFO' })),
  warn: (message: string, extra: any = {}) =>
    console.error(...transform({ message, extra, severity: 'WARNING' })),
  error: (message: string, extra: any = {}) =>
    console.error(...transform({ message, extra, severity: 'ERROR' })),
}
