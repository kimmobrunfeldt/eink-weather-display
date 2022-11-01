import * as dateFns from 'date-fns'
import fs from 'fs'
import path from 'path'
import posthtml from 'posthtml'
import posthtmlInlineAssets from 'posthtml-inline-assets'
import { createPuppeteer, takeScreenshot } from 'src/puppeteer'
import {
  formatNumber,
  formatWindSpeed,
  getBatteryIcon,
  isDark,
  secondsToHoursAndMinutes,
  writeDebugFileSync,
} from 'src/utils'
import {
  getLocalWeatherData,
  getNextHour,
  getSymbolIcon,
  LocalWeather,
  START_FORECAST_HOUR,
} from 'src/weather'
import posthtmlReplace, { Replacement } from './posthtmlReplace'

export type GenerateOptions = {
  locationName: string
  timezone: string
  batteryLevel: number // 0-100
  lat: number
  lon: number
}

export async function generateHtml(opts: GenerateOptions): Promise<string> {
  const weather = await getLocalWeatherData({
    location: { lat: opts.lat, lon: opts.lon },
    timezone: opts.timezone,
  })
  writeDebugFileSync('weather.json', weather)

  const html = await fs.readFileSync(
    path.join(__dirname, 'templates/index.html'),
    { encoding: 'utf8' }
  )

  const { html: processedHtml } = await posthtml([
    posthtmlInlineAssets({
      cwd: path.join(__dirname, 'templates/'),
      errors: 'throw',
    }),
    posthtmlReplace(getHtmlReplacements(opts, weather)),
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

function getHtmlReplacements(
  opts: GenerateOptions,
  weather: LocalWeather
): Replacement[] {
  const now = new Date()
  return [
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
      newContent: String(Math.round(weather.todaySummary.avgTemperature)),
    },
    {
      match: { attrs: { id: 'current-weather-description' } },
      newContent: weather.todaySummary.description,
    },
    {
      match: { attrs: { id: 'current-weather-wind' } },
      newContent: formatWindSpeed(weather.todaySummary.avgWindSpeedMs),
    },
    {
      match: { attrs: { id: 'current-weather-precipitation' } },
      newContent: formatNumber(
        weather.todaySummary.precipitationAmount,
        Math.round
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
      match: { attrs: { id: 'current-weather-uvi' } },
      newContent: formatWindSpeed(weather.todaySummary.maxUvIndex.value),
    },
    {
      match: { attrs: { id: 'current-weather-uvi-at' } },
      newContent: `UVI at ${dateFns.format(
        weather.todaySummary.maxUvIndex.time,
        'HH'
      )}`,
    },

    ...weather.forecastShortTerm
      .map((item, index): Replacement[] => {
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
            newContent: formatNumber(
              item.precipitationAmountFromNowToNext,
              Math.round
            ),
          },
          {
            match: { attrs: { id: `forecast-item-${index}-icon` } },
            modifier: (node) =>
              (node.attrs = {
                ...node.attrs,
                src: getSymbolIcon(
                  item.symbol,
                  isDark({ lat: opts.lat, lon: opts.lon }, item.time)
                    ? 'dark'
                    : 'light'
                ),
              }),
          },
        ]
      })
      .flat(),

    ...weather.forecastLongTerm
      .map((item, index): Replacement[] => {
        return [
          {
            match: { attrs: { id: `forecast-5days-item-${index}-time` } },
            newContent: dateFns.format(item.time, 'EEE'),
          },
          {
            match: {
              attrs: { id: `forecast-5days-item-${index}-temperature` },
            },
            newContent: String(Math.round(item.avgTemperature)),
          },
          {
            match: { attrs: { id: `forecast-5days-item-${index}-icon` } },
            modifier: (node) =>
              (node.attrs = {
                ...node.attrs,
                src: getSymbolIcon(
                  item.symbol,
                  isDark({ lat: opts.lat, lon: opts.lon }, item.time)
                    ? 'dark'
                    : 'light'
                ),
              }),
          },
        ]
      })
      .flat(),
  ]
}
