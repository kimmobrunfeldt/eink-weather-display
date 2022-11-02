import { Request, Response } from 'express'
import _ from 'lodash'
import { generateHtml, generatePng } from 'src/core'
import { HttpError } from 'src/HttpError'
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
    console.debug(
      `Received request to ${request.originalUrl} from ${request.ip}`
    )

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
        console.error('Error while processing', request)
        console.info(
          `Responding with status ${status}: ${err.message}`,
          request
        )
        response.status(status).send(err.message)
        return
      }

      console.error(`Unexpected error while processing `, { request })
      console.info(err.stack, request)
      response.sendStatus(status)
    })
  }
}

async function renderHandler(req: Request, res: Response) {
  const opts = {
    lat: Number(req.query.lat),
    lon: Number(req.query.lng),
    locationName: String(req.query.locationName),
    timezone: String(req.query.timezone),
    batteryLevel: Number(req.query.batteryLevel),

    width: req.query.width ? Number(req.query.width) : undefined,
    height: req.query.height ? Number(req.query.height) : undefined,
  }

  if (!_.isFinite(opts.lat)) {
    throw new HttpError(400, `Invalid 'lat' query parameter: must be a number`)
  }
  if (!_.isFinite(opts.lon)) {
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

  const html = await generateHtml(opts)
  console.log(html)
  await writeDebugFile('render.html', html)
  const png = await generatePng(opts)
  await writeDebugFile('render.png', png)

  res.set('content-type', 'image/png')
  res.status(200).end(png)
}

// Expose as Cloud Function path /render
export const render = createExpressHandler(renderHandler)
