import { environment } from 'src/environment'

const devLog = (_level: string, message: string, extra: any = {}) => {
  // Use error in case output is piped to a file
  const loggerFn = environment.NODE_ENV === 'test' ? console.log : console.error
  loggerFn(message, extra)
}

const prodLog = (level: string, message: string, extra: any = {}) =>
  console.log(JSON.stringify({ message, extra, severity: level }))

const log = ['test', 'development'].includes(environment.NODE_ENV)
  ? devLog
  : prodLog

// https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#LogSeverity
export const logger = {
  debug: (message: string, extra: any = {}) => log('DEBUG', message, extra),
  log: (message: string, extra: any = {}) => log('INFO', message, extra),
  info: (message: string, extra: any = {}) => log('INFO', message, extra),
  warn: (message: string, extra: any = {}) => log('WARNING', message, extra),
  error: (message: string, extra: any = {}) => log('ERROR', message, extra),
}
