import fs from 'fs'
import path from 'path'
import posthtml from 'posthtml'
import posthtmlInlineAssets from 'posthtml-inline-assets'
import { getLocalWeatherData } from 'src/fmi'
import { createPuppeteer, takeScreenshot } from 'src/puppeteer'
import posthtmlReplace from './posthtmlReplace'

export type GenerateOptions = {
  lat: number
  lon: number
}

export async function generateHtml(opts: GenerateOptions): Promise<string> {
  const weather = await getLocalWeatherData(
    { lat: opts.lat, lon: opts.lon },
    '5days'
  )
  console.log(weather)
  const html = await fs.readFileSync(
    path.join(__dirname, 'templates/index.html'),
    { encoding: 'utf8' }
  )

  const { html: processedHtml } = await posthtml([
    posthtmlInlineAssets({
      cwd: path.join(__dirname, 'templates/'),
      errors: 'throw',
    }),
    posthtmlReplace([
      {
        match: { attrs: { id: 'date' } },
        modifier: (node) => (node.content = ['Monday, Oct 17']),
      },
      {
        match: { attrs: { id: 'location' } },
        modifier: (node) => (node.content = ['Espoo']),
      },
      {
        match: { attrs: { id: 'refresh-timestamp' } },
        modifier: (node) => (node.content = ['06:12']),
      },
      {
        match: { attrs: { id: 'battery-icon' } },
        modifier: (node) =>
          (node.attrs = { ...node.attrs, src: 'battery_75.svg' }),
      },
      {
        match: { attrs: { id: 'current-weather-icon' } },
        modifier: (node) =>
          (node.attrs = { ...node.attrs, src: 'battery_75.svg' }),
      },
      {
        match: { attrs: { id: 'current-weather-temperature' } },
        modifier: (node) => (node.content = ['17']),
      },
      {
        match: { attrs: { id: 'current-weather-description' } },
        modifier: (node) => (node.content = ['Cloudy']),
      },
      {
        match: { attrs: { id: 'current-weather-wind' } },
        modifier: (node) => (node.content = ['5']),
      },
      {
        match: { attrs: { id: 'current-rain-probability' } },
        modifier: (node) => (node.content = ['27']),
      },
      {
        match: { attrs: { id: 'current-weather-sunrise' } },
        modifier: (node) => (node.content = ['6:12']),
      },
      {
        match: { attrs: { id: 'current-weather-sunset' } },
        modifier: (node) => (node.content = ['19:21']),
      },
      {
        match: { attrs: { id: 'current-weather-daylight-hours' } },
        modifier: (node) => (node.content = ['10']),
      },
      {
        match: { attrs: { id: 'current-weather-daylight-minutes' } },
        modifier: (node) => (node.content = ['21']),
      },
      {
        match: { attrs: { id: 'current-weather-uvi-at-12' } },
        modifier: (node) => (node.content = ['UVI 3']),
      },
    ]),
  ]).process(html)
  return processedHtml
}

export async function generatePng(opts: GenerateOptions): Promise<Buffer> {
  const { page, browser } = await createPuppeteer()
  const html = await generateHtml(opts)
  const png = await takeScreenshot(page, html)
  await browser.close()
  return png
}
