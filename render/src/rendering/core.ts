import * as dateFns from 'date-fns'
import * as dateFnsTz from 'date-fns-tz'
import fs from 'fs'
import _ from 'lodash'
import posthtml from 'posthtml'
import posthtmlInlineAssets from 'posthtml-inline-assets'
import sharp from 'sharp'
import posthtmlInlineStyleCssImports from 'src/rendering/posthtmlInlineStyleCssImports'
import posthtmlReplace, { Replacement } from 'src/rendering/posthtmlReplace'
import { createPuppeteer, takeScreenshot } from 'src/rendering/puppeteer'
import { Coordinate, LocalWeather, ShortTermWeatherDataPoint } from 'src/types'
import { logger } from 'src/utils/logger'
import {
  formatAccurateNumber,
  formatAccurateNumberWhenLow,
  formatNumber,
  getBatteryIcon,
  getPathWithinSrc,
  getTodayDates,
  isDark,
  scaleTo,
  secondsToHoursAndMinutes,
  writeDebugFile,
} from 'src/utils/utils'
import { generateRandomLocalWeatherData } from 'src/weather/random'
import {
  SHORT_TERM_FORECAST_HOURS_TODAY,
  SHORT_TERM_FORECAST_HOURS_TOMORROW,
  getLocalWeatherData,
} from 'src/weather/weather'
import {
  getSymbolIcon,
  weatherSymbolDescriptions,
} from 'src/weather/weatherSymbol'

export type GenerateOptions = {
  location: Coordinate
  locationName: string
  timezone: string
  batteryLevel: number // 0-100
  showBatteryPercentage?: boolean
  batteryCharging?: boolean
  switchDayAtHour: number
  // Viewport width in headless Chrome
  width?: number
  // Viewport height in headless Chrome
  height?: number
  // Enable random generation mode?
  random?: boolean
  // Resize browser-generated image to this width
  resizeToWidth?: number
  // Resize browser-generated image to this height
  resizeToHeight?: number
  // Amount of white padding to add to left in px
  paddingLeft?: number
  // Amount of white padding to add to top in px
  paddingTop?: number
  // Amount of white padding to add to right in px
  paddingRight?: number
  // Amount of white padding to add to bottom in px
  paddingBottom?: number
  flip?: boolean
  flop?: boolean
  rotate?: number
}

// 10.3" Waveshare e-ink display resolution
export const DEFAULT_IMAGE_WIDTH = 1872
export const DEFAULT_IMAGE_HEIGHT = 1404

const MIN_WIND_MS_TO_SHOW_ALERT_ICON = 10

export async function generateHtml(opts: GenerateOptions): Promise<string> {
  const weather = opts.random
    ? await generateRandomLocalWeatherData(opts)
    : await getLocalWeatherData(opts)
  await writeDebugFile('weather.json', weather)

  const html = await fs.readFileSync(getPathWithinSrc('templates/index.html'), {
    encoding: 'utf8',
  })

  const { html: processedHtml } = await posthtml([
    posthtmlReplace(getHtmlReplacements(opts, weather)),
    posthtmlInlineStyleCssImports(),
    posthtmlInlineAssets({
      cwd: getPathWithinSrc('templates/'),
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
  const resizedPng = await resize(png, { ...opts, width, height })
  return { html, png: resizedPng }
}

type ResizeOptions = Pick<
  GenerateOptions,
  | 'resizeToWidth'
  | 'resizeToHeight'
  | 'paddingLeft'
  | 'paddingTop'
  | 'paddingBottom'
  | 'paddingRight'
  | 'flip'
  | 'flop'
  | 'rotate'
> &
  Required<Pick<GenerateOptions, 'width' | 'height'>>
async function resize(png: Buffer, opts: ResizeOptions): Promise<Buffer> {
  const toDimensions = getResizeDimensions(opts)
  const image = sharp(png)

  if (opts.flip) image.flip()
  if (opts.flop) image.flop()
  if (opts.rotate) image.rotate(opts.rotate)

  image.resize(toDimensions.width, toDimensions.height).extend({
    ...(opts.paddingTop ? { top: opts.paddingTop } : {}),
    ...(opts.paddingRight ? { right: opts.paddingRight } : {}),
    ...(opts.paddingBottom ? { bottom: opts.paddingBottom } : {}),
    ...(opts.paddingLeft ? { left: opts.paddingLeft } : {}),
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  })

  return image.png().toBuffer()
}

function getResizeDimensions(opts: ResizeOptions): {
  width: number | null
  height: number | null // null means: only resize to the other constraint
} {
  if (!opts.resizeToHeight && !opts.resizeToWidth) {
    return { width: opts.width, height: opts.height }
  } else if (opts.resizeToWidth && opts.resizeToHeight) {
    return {
      width: opts.resizeToWidth,
      height: opts.resizeToHeight,
    }
  } else if (opts.resizeToWidth) {
    return { width: opts.resizeToWidth, height: null }
  } else if (opts.resizeToHeight) {
    return { width: null, height: opts.resizeToHeight }
  }

  throw new Error(`Unexpected options: ${opts}`)
}

function getHtmlReplacements(
  opts: GenerateOptions,
  weather: LocalWeather
): Replacement[] {
  const now = new Date()
  const closestShortTermDataPoint = _.minBy(weather.forecastShortTerm, (d) =>
    Math.abs(now.getTime() - d.time.getTime())
  )
  if (!closestShortTermDataPoint) {
    throw new Error(
      `Unable to find closest short term data point near to ${now.toISOString()}`
    )
  }

  // We want to find a forecast data point because weathercodes for forecasts are from FMI,
  // whereas observation weather codes are from meteo
  const closestShortTermForecastDataPoint = _.minBy(
    weather.forecastShortTerm.filter((d) => d.type === 'forecast'),
    (d) => Math.abs(now.getTime() - d.time.getTime())
  )
  if (!closestShortTermForecastDataPoint) {
    throw new Error(
      `Unable to find closest short term forecast data point near to ${now.toISOString()}`
    )
  }
  const minWindSpeedToday = formatNumber(
    weather.todaySummary.forecast.minWindSpeedMs,
    formatAccurateNumberWhenLow
  )

  const maxWindSpeedToday = formatNumber(
    Math.max(
      weather.todaySummary.forecast.maxWindSpeedMs,
      weather.todaySummary.forecast.maxWindGustMs
    ),
    formatAccurateNumberWhenLow
  )
  const windSpeedLabelToday =
    minWindSpeedToday === maxWindSpeedToday
      ? minWindSpeedToday
      : `${minWindSpeedToday} - ${maxWindSpeedToday}`

  const findDataPoint = (h: number) => {
    const time = dateFns.addHours(dates.startOfLocalDayInUtc, h)
    const found = weather.hourlyDataPoints.find((d) =>
      dateFns.isEqual(d.time, time)
    )
    if (!found) {
      logger.error('Time:', time)
      logger.error('Hourly data points:', weather.hourlyDataPoints)
      throw new Error(
        `Could not find FMI hourly data point for date ${time.toISOString()}`
      )
    }
    return found
  }
  const dates = getTodayDates(opts.switchDayAtHour, opts.timezone)

  const earliestShortTermForecastDataPoint = _.minBy(
    weather.forecastShortTerm,
    (d) => d.time.getTime()
  )
  if (!earliestShortTermForecastDataPoint) {
    throw new Error(`Unable to find earliest short term data point`)
  }
  const firstHour = getLocalHour(earliestShortTermForecastDataPoint.time, opts)
  // Visually, we want the histogram bars align to the hour labels. That means that
  // for the first hour range (9-12AM at the time of writing), we actually need to get data for
  // 1h before that. Also for the last hour we need to get 1h
  const todayHistogramHours = _.range(
    firstHour - 1,
    _.last(SHORT_TERM_FORECAST_HOURS_TODAY)! + 2 // +1h  +1 for how _.range works
  )
  logger.info('todayHistogramHours', todayHistogramHours)
  const todayHistogramDataPoints = todayHistogramHours.map(findDataPoint)

  // The random constants we subtract from those hours are to align graphs nicely with hour headers
  const tomorrowHistogramHours = _.range(
    SHORT_TERM_FORECAST_HOURS_TOMORROW[0] - 4, // -4h
    // -5h  +1 for how _.range works.
    _.last(SHORT_TERM_FORECAST_HOURS_TOMORROW)! - 5 + 1
  )
  logger.info('tomorrowHistogramHours', tomorrowHistogramHours)
  const tomorrowHistogramDataPoints = tomorrowHistogramHours.map(findDataPoint)

  const shouldWarnAboutWind =
    weather.todaySummary.forecast.maxWindSpeedMs >=
      MIN_WIND_MS_TO_SHOW_ALERT_ICON ||
    weather.todaySummary.forecast.maxWindGustMs >=
      MIN_WIND_MS_TO_SHOW_ALERT_ICON

  return [
    {
      match: { attrs: { id: 'data' } },
      newContent: `const DATA = \`${JSON.stringify({
        todayDataPoints: todayHistogramDataPoints.map((d) =>
          dataPointToD3Data(d, opts)
        ),
        tomorrowDataPoints: tomorrowHistogramDataPoints.map((d) =>
          dataPointToD3Data(d, opts)
        ),
        todayMinTemperature: weather.todaySummary.all.minTemperature,
        todayMaxTemperature: weather.todaySummary.all.maxTemperature,
        timeNow: new Date().toISOString(),
      })}\``,
    },
    {
      match: { attrs: { id: 'date' } },
      newContent: dateFnsTz.formatInTimeZone(
        getTodayDates(opts.switchDayAtHour, opts.timezone).startOfLocalDayInUtc,
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
          src: `assets/${getBatteryIcon(
            opts.batteryLevel,
            opts.batteryCharging
          )}`,
        }),
    },
    {
      match: { attrs: { id: 'battery-value' } },
      modifier: (node) => {
        node.content = [`${Math.round(opts.batteryLevel)}%`]
        if (!opts.showBatteryPercentage) {
          node.attrs = { ...node.attrs, display: 'none', visiblity: 'hidden' }
        }
      },
    },
    {
      match: { attrs: { id: 'current-weather-icon' } },
      modifier: (node) =>
        (node.attrs = {
          ...node.attrs,
          src: getSymbolIcon(
            closestShortTermForecastDataPoint.symbol,
            isDark(opts.location, closestShortTermDataPoint.time)
              ? 'dark'
              : 'light'
          ),
        }),
    },
    {
      match: { attrs: { id: 'current-weather-temperature' } },
      newContent: String(Math.round(closestShortTermDataPoint.temperature)),
    },
    {
      match: { attrs: { id: 'current-weather-description' } },
      newContent:
        weatherSymbolDescriptions[closestShortTermForecastDataPoint.symbol],
    },
    {
      match: { attrs: { id: 'current-weather-wind-icon' } },
      modifier: (node) =>
        (node.attrs = {
          ...node.attrs,
          src: shouldWarnAboutWind
            ? 'weather-icons/wind-warning.png'
            : 'weather-icons/svg-icons/wi-strong-wind.svg',
          style: shouldWarnAboutWind ? 'width: 50px;' : '',
        }),
    },
    {
      match: { attrs: { id: 'current-weather-wind' } },
      newContent:
        windSpeedLabelToday.length > 8
          ? windSpeedLabelToday.replaceAll(' ', '')
          : windSpeedLabelToday,
    },
    {
      match: { attrs: { id: 'current-weather-wind' } },
      modifier: (node) =>
        (node.attrs = {
          ...node.attrs,
          style: shouldWarnAboutWind ? 'text-decoration: underline;' : '',
        }),
    },
    {
      match: { attrs: { id: 'current-weather-wind-unit' } },
      modifier: (node) =>
        (node.attrs = {
          ...node.attrs,
          style: shouldWarnAboutWind ? 'text-decoration: underline;' : '',
        }),
    },
    {
      match: { attrs: { id: 'current-weather-wind-alert' } },
      newContent: shouldWarnAboutWind ? '!' : '',
    },
    {
      match: { attrs: { id: 'current-weather-precipitation' } },
      newContent: formatNumber(
        weather.todaySummary.forecast.precipitationAmount,
        formatAccurateNumberWhenLow
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
      newContent: formatAccurateNumber(
        weather.todaySummary.forecast.maxUvIndex.value
      ),
    },
    {
      match: { attrs: { id: 'current-weather-uvi-at' } },
      newContent: `UVI at ${dateFnsTz.formatInTimeZone(
        weather.todaySummary.forecast.maxUvIndex.time,
        opts.timezone,
        'HH'
      )}`,
    },
    {
      match: { attrs: { id: 'forecast-today-minmax-meter' } },
      modifier: (node) => {
        node.attrs = {
          ...node.attrs,
          style: `--current-percentage-of-max: ${scaleTo(
            closestShortTermDataPoint.temperature,
            weather.todaySummary.all.minTemperature,
            weather.todaySummary.all.maxTemperature,
            0,
            100
          )}%`,
        }
      },
    },
    {
      match: { attrs: { id: 'today-weather-min-temperature' } },
      newContent: String(Math.round(weather.todaySummary.all.minTemperature)),
    },
    {
      match: { attrs: { id: 'today-weather-max-temperature' } },
      newContent: String(Math.round(weather.todaySummary.all.maxTemperature)),
    },
    {
      match: { attrs: { id: 'forecast-item-pre-header' } },
      newContent: dateFnsTz.formatInTimeZone(
        dateFns.addDays(
          getTodayDates(opts.switchDayAtHour, opts.timezone)
            .startOfLocalDayInUtc,
          1
        ),
        opts.timezone,
        'EEE'
      ),
    },
    {
      match: { attrs: { id: 'forecast-items-background1' } },
      modifier: (node) => {
        const count = _.sumBy(_.take(weather.forecastShortTerm, 5), (f) =>
          f.type === 'forecast' ? 1 : 0
        )
        node.attrs = {
          ...node.attrs,
          style: `--start-index: ${5 - count};`,
        }
      },
    },
    ...weather.forecastShortTerm
      .map((item, index): Replacement[] => {
        return [
          {
            match: { attrs: { id: `forecast-item-${index}` } },
            modifier: (node) => {
              node.attrs = {
                ...node.attrs,
                class: `${
                  node.attrs?.class ? node.attrs.class : ''
                } Forecast-item--${item.type}`,
              }
            },
          },
          {
            match: { attrs: { id: `forecast-item-${index}-time` } },
            newContent: dateFnsTz.formatInTimeZone(
              item.time,
              opts.timezone,
              'HH'
            ),
          },
          {
            match: { attrs: { id: `forecast-item-${index}-temperature` } },
            newContent: String(Math.round(item.temperature)),
          },
          {
            match: { attrs: { id: `forecast-item-${index}-wind` } },
            newContent: formatAccurateNumber(item.windSpeedMs),
          },
          {
            match: { attrs: { id: `forecast-item-${index}-precipitation` } },
            newContent: formatNumber(
              item.precipitationAmountFromNowToNext,
              formatAccurateNumberWhenLow
            ),
          },
          {
            match: { attrs: { id: `forecast-item-${index}-icon` } },
            modifier: (node) => {
              node.attrs = {
                ...node.attrs,
                src: getSymbolIcon(
                  item.symbol,
                  isDark(opts.location, item.time) ? 'dark' : 'light'
                ),
              }
            },
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
            match: {
              attrs: { id: `forecast-5days-item-${index}-precipitation` },
            },
            newContent: formatNumber(
              item.precipitationAmountFromNowToNext,
              formatAccurateNumberWhenLow
            ),
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

function getLocalHour(date: Date, opts: GenerateOptions): number {
  return parseInt(dateFnsTz.formatInTimeZone(date, opts.timezone, 'HH'), 10)
}

function dataPointToD3Data(
  dataPoint: ShortTermWeatherDataPoint,
  opts: GenerateOptions
) {
  return {
    temperature: dataPoint.temperature,
    precipitation1h: dataPoint.precipitation1h,
    localHour: parseInt(
      dateFnsTz.formatInTimeZone(dataPoint.time, opts.timezone, 'HH'),
      10
    ),
    time: dataPoint.time.toISOString(),
  }
}
