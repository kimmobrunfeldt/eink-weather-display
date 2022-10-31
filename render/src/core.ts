import * as dateFns from 'date-fns'
import fs from 'fs'
import _ from 'lodash'
import path from 'path'
import posthtml from 'posthtml'
import posthtmlInlineAssets from 'posthtml-inline-assets'
import { createPuppeteer, takeScreenshot } from 'src/puppeteer'
import {
  getLocalWeatherData,
  getNextHour,
  getSymbolIcon,
  START_FORECAST_HOUR,
} from 'src/weather'
import posthtmlReplace from './posthtmlReplace'

export type GenerateOptions = {
  locationName: string
  batteryLevel: number // 0-100
  lat: number
  lon: number
}

const secondsToHoursAndMinutes = (s: number) => {
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return {
    h,
    m,
  }
}

export async function generateHtml(opts: GenerateOptions): Promise<string> {
  const now = new Date()
  const weather = await getLocalWeatherData({
    location: { lat: opts.lat, lon: opts.lon },
    type: 'today',
  })

  fs.writeFileSync('weather.json', JSON.stringify(weather, null, 2), {
    encoding: 'utf-8',
  })

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
        newContent: dateFns.format(
          getNextHour(START_FORECAST_HOUR),
          'EEEE, MMM d'
        ),
      },
      {
        match: { attrs: { id: 'location' } },
        newContent: opts.locationName,
      },
      {
        match: { attrs: { id: 'refresh-timestamp' } },
        newContent: dateFns.format(now, 'HH:mm'),
      },
      {
        match: { attrs: { id: 'battery-icon' } },
        modifier: (node) =>
          (node.attrs = {
            ...node.attrs,
            src: getBatteryIcon(opts.batteryLevel),
          }),
      },
      {
        match: { attrs: { id: 'current-weather-icon' } },
        modifier: (node) =>
          (node.attrs = {
            ...node.attrs,
            src: getSymbolIcon(weather.todaySummary.symbol, 'light'),
          }),
      },
      {
        match: { attrs: { id: 'current-weather-temperature' } },
        newContent: String(Math.round(weather.todaySummary.maxTemperature)),
      },
      {
        match: { attrs: { id: 'current-weather-description' } },
        newContent: weather.todaySummary.description,
      },
      {
        match: { attrs: { id: 'current-weather-wind' } },
        newContent: formatWindSpeed(weather.todaySummary.maxWindMs),
      },
      {
        match: { attrs: { id: 'current-weather-precipitation' } },
        newContent: String(
          Math.round(weather.todaySummary.precipitationAmount)
        ),
      },
      {
        match: { attrs: { id: 'current-weather-sunrise' } },
        newContent: dateFns.format(weather.todaySummary.sunrise, 'H:mm'),
      },
      {
        match: { attrs: { id: 'current-weather-sunset' } },
        newContent: dateFns.format(weather.todaySummary.sunset, 'H:mm'),
      },
      {
        match: { attrs: { id: 'current-weather-daylight-hours' } },
        newContent: String(
          secondsToHoursAndMinutes(weather.todaySummary.dayDurationInSeconds).h
        ),
      },
      {
        match: { attrs: { id: 'current-weather-daylight-minutes' } },
        newContent: String(
          secondsToHoursAndMinutes(weather.todaySummary.dayDurationInSeconds).m
        ),
      },
      {
        match: { attrs: { id: 'current-weather-uvi-at-12' } },
        newContent: `UVI ${weather.todaySummary.maxUvIndex}`,
      },
      ...weather.forecast
        .map((item, index) => {
          return [
            {
              match: { attrs: { id: `forecast-item-${index}-time` } },
              newContent: dateFns.format(item.time, 'H:mm'),
            },
            {
              match: { attrs: { id: `forecast-item-${index}-temperature` } },
              newContent: String(Math.round(item.temperature)),
            },
            {
              match: { attrs: { id: `forecast-item-${index}-wind` } },
              newContent: formatWindSpeed(item.windSpeedMs),
            },
            {
              match: { attrs: { id: `forecast-item-${index}-precipitation` } },
              newContent: String(
                Math.round(item.precipitationAmountFromNowToNext)
              ),
            },
          ]
        })
        .flat(),
    ]),
  ]).process(html)
  return processedHtml
}

function formatWindSpeed(n: number): string {
  const str = n.toFixed(1)
  if (str.endsWith('.0')) {
    return String(Math.round(n))
  }

  return str
}

function getBatteryIcon(level: number): string {
  const closest = _.minBy([0, 25, 50, 75, 100], (n) => Math.abs(n - level))
  return `battery_${closest}.svg`
}

export async function generatePng(opts: GenerateOptions): Promise<Buffer> {
  const { page, browser } = await createPuppeteer()
  const html = await generateHtml(opts)
  const png = await takeScreenshot(page, html)
  await browser.close()
  return png
}
