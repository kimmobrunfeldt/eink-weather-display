#!/usr/bin/env ./bin/ts-node
import { getLocalWeather } from 'src/fmi'
import yargs from 'yargs'

const argv = yargs(process.argv.slice(2))
  .options({
    lat: { type: 'number', demandOption: true },
    lon: { type: 'number', demandOption: true },
  })
  .parseSync()

async function main() {
  const weather = getLocalWeather({ lat: argv.lat, lon: argv.lon })
  console.log(argv, weather)
}

main()
