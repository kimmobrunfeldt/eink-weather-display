import { Request, Response } from 'express'
import _ from 'lodash'
import { generatePng } from 'src/core'
import { environment } from 'src/environment'
import { HttpError } from 'src/HttpError'
import { logger } from 'src/logger'
import { writeDebugFile } from 'src/utils'

type ExpressHandler = (request: Request, response: Response) => void
type WebhookHandler = (request: Request, response: Response) => Promise<any>

/**
 * Creates a webhook handler with centralized error handling.
 *
 * Each handler function is responsible for sending an HTTP response after
 * successful processing. However errors should be thrown (Promise rejection)
 * to be correctly propagated to this centralized error handler.
 *
 * There's not that much documentation from
 * Google about error handling, but here's a few references:
 *
 * @see https://cloud.google.com/functions/docs/concepts/nodejs-runtime#signal-termination
 * @see https://cloud.google.com/functions/docs/monitoring/error-reporting
 *
 * Based on online examples, standard Express error handling rules seem to
 * apply.
 */
function createExpressHandler(handler: WebhookHandler): ExpressHandler {
  return (request, response) => {
    logger.info(`Received request to ${request.originalUrl} from ${request.ip}`)

    /**
     * Synchronously thrown errors should go into Error Reporting, so they are
     * not handled separately.
     *
     * "Uncaught exceptions produced by your function will appear in
     * Error Reporting."
     *
     * @see https://cloud.google.com/functions/docs/monitoring/error-reporting
     */
    handler(request, response).catch((err) => {
      const status = err.status ?? 500

      if (status < 500) {
        logger.error('Error while processing', {
          request: requestToLoggable(request),
        })
        logger.info(`Responding with status ${status}: ${err.message}`, {
          request: requestToLoggable(request),
        })
        response.status(status).send(err.message)
        return
      }

      logger.error(`Unexpected error while processing`, {
        request: requestToLoggable(request),
      })
      logger.error(err.message, {
        stack: err.stack,
        request: requestToLoggable(request),
      })
      response.sendStatus(status)
    })
  }
}

function requestToLoggable(req: Request) {
  return {
    originalUrl: req.originalUrl,
    body: req.body,
    query: req.query,
    headers: req.headers,
    method: req.method,
  }
}

function getGivenApiKey(req: Request): string {
  if (req.query.apiKey) {
    return String(req.query.apiKey)
  }
  return String(req.headers['x-api-key'])
}

async function renderHandler(req: Request, res: Response) {
  if (
    environment.NODE_ENV !== 'development' &&
    environment.API_KEY &&
    !environment.API_KEY.split(',').includes(getGivenApiKey(req))
  ) {
    throw new HttpError(401, 'Invalid API key')
  }

  const opts = {
    location: { lat: Number(req.query.lat), lon: Number(req.query.lon) },
    locationName: String(req.query.locationName),
    timezone: String(req.query.timezone),
    batteryLevel: Number(req.query.batteryLevel),

    width: req.query.width ? Number(req.query.width) : undefined,
    height: req.query.height ? Number(req.query.height) : undefined,
  }

  if (!_.isFinite(opts.location.lat)) {
    throw new HttpError(400, `Invalid 'lat' query parameter: must be a number`)
  }
  if (!_.isFinite(opts.location.lon)) {
    throw new HttpError(400, `Invalid 'lon' query parameter: must be a number`)
  }
  if (
    !_.isFinite(opts.batteryLevel) ||
    opts.batteryLevel > 100 ||
    opts.batteryLevel < 0
  ) {
    throw new HttpError(
      400,
      `Invalid 'batteryLevel' query parameter: must be a number between 0-100`
    )
  }
  if (_.isEmpty(opts.timezone)) {
    throw new HttpError(400, `Invalid 'timezone' query parameter`)
  }
  if (_.isEmpty(opts.locationName)) {
    throw new HttpError(400, `Invalid 'locationName' query parameter`)
  }
  if (!_.isUndefined(opts.width) && !_.isFinite(opts.width)) {
    throw new HttpError(
      400,
      `Invalid 'width' query parameter: must be a number`
    )
  }
  if (!_.isUndefined(opts.height) && !_.isFinite(opts.height)) {
    throw new HttpError(
      400,
      `Invalid 'height' query parameter: must be a number`
    )
  }

  const { png, html } = await generatePng({ ...opts, startForecastAtHour: 9 })
  await writeDebugFile('render.html', html)
  await writeDebugFile('render.png', png)

  res.set('content-type', 'image/png')
  res.status(200).end(png)
}

// Expose as Cloud Function path /render
export const render = createExpressHandler(renderHandler)
