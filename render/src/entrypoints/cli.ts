#!/usr/bin/env ./bin/ts-node
import _ from 'lodash'
import sharp from 'sharp'
import {
  DEFAULT_IMAGE_HEIGHT,
  DEFAULT_IMAGE_WIDTH,
  generatePng,
} from 'src/rendering/core'
import { logger } from 'src/utils/logger'
import { writeDebugFile } from 'src/utils/utils'
import yargs from 'yargs'

const argv = yargs(process.argv.slice(2))
  .options({
    lat: { type: 'number', demandOption: true },
    lon: { type: 'number', demandOption: true },
    locationName: { type: 'string', demandOption: true },
    timezone: { type: 'string', demandOption: true },
    batteryLevel: { type: 'number', demandOption: true },
    width: { type: 'number', demandOption: false },
    height: { type: 'number', demandOption: false },
    random: {
      type: 'boolean',
      demandOption: false,
      description: 'When enabled, random values are used for rendering',
    },
    randomIterations: {
      type: 'number',
      demandOption: false,
      default: 1,
      description:
        'When set to above 1, rendering process will be done N times with low opacity. Finally the images are stacked on top of eachother. Defaults to 1.',
    },
  })
  .parseSync()

async function main() {
  if (argv.random) {
    return await random()
  }

  const { lat, lon, ...otherArgv } = argv
  const { png, html } = await generatePng({
    ...otherArgv,
    location: { lat, lon },
    startForecastAtHour: 9,
  })
  console.log(html)
  await writeDebugFile('render.png', png)
}

async function random() {
  const { lat, lon, ...otherArgv } = argv
  const randomBatteryLevel = _.random(0, 100)

  const opacityPerImage = 1 / argv.randomIterations
  let image = await getRandomBaseImage()
  for (const i of _.range(argv.randomIterations)) {
    const { png, html } = await generatePng({
      ...otherArgv,
      batteryLevel: randomBatteryLevel, // override cli arg with random
      location: { lat, lon },
      startForecastAtHour: 9,
    })
    const layer = await sharp(png)
      .removeAlpha()
      .ensureAlpha(opacityPerImage)
      .toBuffer()
    image = await sharp(image)
      .composite([{ input: layer }])
      .toBuffer()

    await writeDebugFile('random.html', html)
    await writeDebugFile('random-layer.png', png)
    logger.info(`Layer with index ${i} rendered`)
  }

  await writeDebugFile('random-all-composite.png', image)
}

async function getRandomBaseImage() {
  return await sharp({
    create: {
      width: DEFAULT_IMAGE_WIDTH,
      height: DEFAULT_IMAGE_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer()
}

main()
