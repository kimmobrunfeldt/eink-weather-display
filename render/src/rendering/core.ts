import * as dateFns from 'date-fns'
import * as dateFnsTz from 'date-fns-tz'
import fs from 'fs'
import posthtml from 'posthtml'
import posthtmlInlineAssets from 'posthtml-inline-assets'
import posthtmlInlineStyleCssImports from 'src/rendering/posthtmlInlineStyleCssImports'
import posthtmlReplace, { Replacement } from 'src/rendering/posthtmlReplace'
import { createPuppeteer, takeScreenshot } from 'src/rendering/puppeteer'
import { Coordinate, LocalWeather } from 'src/types'
import {
  formatNumber,
  formatWindSpeed,
  getBatteryIcon,
  getNextHourDates,
  getProjectPath,
  isDark,
  secondsToHoursAndMinutes,
  writeDebugFile,
} from 'src/utils/utils'
import { generateRandomLocalWeatherData } from 'src/weather/random'
import { getLocalWeatherData } from 'src/weather/weather'
import { getSymbolIcon } from 'src/weather/weatherSymbol'

export type GenerateOptions = {
  location: Coordinate
  locationName: string
  timezone: string
  batteryLevel: number // 0-100
  startForecastAtHour: number
  width?: number
  height?: number
  random?: boolean
}

// 10.3" Waveshare e-ink display resolution
export const DEFAULT_IMAGE_WIDTH = 1872
export const DEFAULT_IMAGE_HEIGHT = 1404

export async function generateHtml(opts: GenerateOptions): Promise<string> {
  const weather = opts.random
    ? await generateRandomLocalWeatherData(opts)
    : await getLocalWeatherData(opts)
  await writeDebugFile('weather.json', weather)

  const html = await fs.readFileSync(getProjectPath('templates/index.html'), {
    encoding: 'utf8',
  })

  const { html: processedHtml } = await posthtml([
    posthtmlReplace(getHtmlReplacements(opts, weather)),
    posthtmlInlineStyleCssImports(),
    posthtmlInlineAssets({
      cwd: getProjectPath('templates/'),
      errors: 'throw',
    }),
  ]).process(html)
  return processedHtml
}

export async function generatePng(
  opts: GenerateOptions
): Promise<{ png: Buffer; html: string }> {
  const { width = DEFAULT_IMAGE_WIDTH, height = DEFAULT_IMAGE_HEIGHT } = opts
  const { page, browser } = await createPuppeteer({
    width,
    height,
  })
  const html = await generateHtml(opts)
  const png = await takeScreenshot(page, html)
  await browser.close()
  return { html, png }
}

function getHtmlReplacements(
  opts: GenerateOptions,
  weather: LocalWeather
): Replacement[] {
  const now = new Date()
  return [
    {
      match: { attrs: { id: 'date' } },
      newContent: dateFnsTz.formatInTimeZone(
        getNextHourDates(opts.startForecastAtHour, opts.timezone).hourInUtc,
        opts.timezone,
        'EEEE, MMM d'
      ),
    },
    {
      match: { attrs: { id: 'location' } },
      newContent: opts.locationName,
    },
    {
      match: { attrs: { id: 'refresh-timestamp' } },
      newContent: dateFnsTz.formatInTimeZone(now, opts.timezone, 'HH:mm'),
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
      newContent: dateFnsTz.formatInTimeZone(
        weather.todaySummary.sunrise,
        opts.timezone,
        'H:mm'
      ),
    },
    {
      match: { attrs: { id: 'current-weather-sunset' } },
      newContent: dateFnsTz.formatInTimeZone(
        weather.todaySummary.sunset,
        opts.timezone,
        'H:mm'
      ),
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
      newContent: `UVI at ${dateFnsTz.formatInTimeZone(
        weather.todaySummary.maxUvIndex.time,
        opts.timezone,
        'HH'
      )}`,
    },
    {
      match: { attrs: { id: 'forecast-item-pre-header' } },
      newContent: dateFnsTz.formatInTimeZone(
        dateFns.addDays(
          getNextHourDates(opts.startForecastAtHour, opts.timezone).hourInUtc,
          1
        ),
        opts.timezone,
        'EEE'
      ),
    },
    ...weather.forecastShortTerm
      .map((item, index): Replacement[] => {
        return [
          {
            match: { attrs: { id: `forecast-item-${index}-time` } },
            newContent: dateFnsTz.formatInTimeZone(
              item.time,
              opts.timezone,
              'H:mm'
            ),
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
                  isDark(opts.location, item.time) ? 'dark' : 'light'
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
            newContent: dateFnsTz.formatInTimeZone(
              item.time,
              opts.timezone,
              'EEE'
            ),
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
                src: getSymbolIcon(item.symbol, 'light'),
              }),
          },
        ]
      })
      .flat(),
  ]
}
