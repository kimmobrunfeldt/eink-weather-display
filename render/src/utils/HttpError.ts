import { STATUS_CODES } from 'http'

export class HttpError extends Error {
  readonly status: number

  constructor(httpStatus: number, message?: string) {
    super(message ?? STATUS_CODES[httpStatus])
    this.status = httpStatus
  }
}
