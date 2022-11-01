#!/usr/bin/env ./bin/ts-node
import { generateHtml, generatePng } from 'src/core'
import { writeDebugFileSync } from 'src/utils'
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
  const html = await generateHtml(argv)
  console.log(html)
  const png = await generatePng(argv)
  writeDebugFileSync('render.png', png)
}

main()
