#!/usr/bin/env ./bin/ts-node
import { generatePng } from 'src/core'
import { writeDebugFile } from 'src/utils'
import yargs from 'yargs'

const argv = yargs(process.argv.slice(2))
  .options({
    lat: { type: 'number', demandOption: true },
    lon: { type: 'number', demandOption: true },
    width: { type: 'number', demandOption: false },
    height: { type: 'number', demandOption: false },
    locationName: { type: 'string', demandOption: true },
    timezone: { type: 'string', demandOption: true },
    batteryLevel: { type: 'number', demandOption: true },
  })
  .parseSync()

async function main() {
  const { lat, lon, ...otherArgv } = argv
  const { png, html } = await generatePng({
    ...otherArgv,
    location: { lat, lon },
    startForecastAtHour: 9,
  })
  console.log(html)
  await writeDebugFile('render.png', png)
}

main()