#!/usr/bin/env ./bin/ts-node
import { generateHtml } from 'src/core'
import yargs from 'yargs'

const argv = yargs(process.argv.slice(2))
  .options({
    lat: { type: 'number', demandOption: true },
    lon: { type: 'number', demandOption: true },
  })
  .parseSync()

async function main() {
  const html = await generateHtml(argv)
  console.log(html)
}

main()
