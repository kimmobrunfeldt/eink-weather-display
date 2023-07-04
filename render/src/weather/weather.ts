import * as dateFns from 'date-fns'
import _ from 'lodash'
import { GenerateOptions } from 'src/rendering/core'
import {
  LocalWeather,
  LongTermWeatherDataPoint,
  MaxUvIndex,
  MeteoWeatherCode,
  ShortTermWeatherDataPoint,
  WeatherSymbolNumber,
  WeatherTodaySummary,
} from 'src/types'
import { logger } from 'src/utils/logger'
import { getTodayDates, sumByOrNull } from 'src/utils/utils'
import {
  FmiEcmwfDataPoint,
  FmiHarmonieDataPoint,
  FmiObservationDataPoint,
  fetchFmiEcmwfData,
  fetchFmiHarmonieData,
  fetchFmiObservationData,
} from 'src/weather/fmiApi'
import {
  MeteoAirQualityForecastResponse,
  MeteoLongTermForecastResponse,
  MeteoShortTermForecastResponse,
  attrsByTime,
  fetchMeteoAirQualityForecastToday,
  fetchMeteoForecastLongTerm,
  fetchMeteoForecastShortTerm,
} from 'src/weather/meteoApi'
import {
  meteoToFmiWeatherSymbolNumber,
  weatherSymbolDescriptions,
} from 'src/weather/weatherSymbol'
import { getSunrise, getSunset } from 'sunrise-sunset-js'

export async function getLocalWeatherData(
  opts: GenerateOptions
): Promise<LocalWeather> {
  const dates = getTodayDates(opts.switchDayAtHour, opts.timezone)
  logger.debug('getTodayDates', dates)

  const fmiHarmonieData = await fetchFmiHarmonieData(opts)
  const fmiEcmwfData = await fetchFmiEcmwfData(opts)
  const fmiObservationData = await fetchFmiObservationData(opts)
  const meteoLongTermForecastData = await fetchMeteoForecastLongTerm(opts)
  const meteoShortTermForecastData = await fetchMeteoForecastShortTerm(opts)
  const meteoAirQualityForecastData = await fetchMeteoAirQualityForecastToday(
    opts
  )

  const maxUv = findHighestUVIndex(meteoAirQualityForecastData, opts)
  const { forecast: todaySummaryForecast, ...todaySummaryRest } =
    calculateTodaySummaryFromFmiData(fmiHarmonieData, fmiObservationData, opts)
  return {
    todaySummary: {
      ...todaySummaryRest,
      forecast: { ...todaySummaryForecast, maxUvIndex: maxUv },
    },
    forecastShortTerm: calculateShortTermForecast(
      fmiHarmonieData,
      meteoShortTermForecastData,
      fmiObservationData,
      opts
    ),
    hourlyDataPoints: calculateShortTermForecast(
      fmiHarmonieData,
      meteoShortTermForecastData,
      fmiObservationData,
      opts,
      // Harmonie returns "up to 50h forecast", the earliest we query is at 6AM
      // It should be safe to add 54 hours to the start of local day, since those
      // hours are max 48h from the query time
      _.range(55).map((h) => dateFns.addHours(dates.startOfLocalDayInUtc, h))
    ),
    forecastLongTerm: calculateLongTermForecast(fmiEcmwfData, opts).map(
      (data) => {
        return {
          ...data,
          symbol: findWeatherSymbolForDay(meteoLongTermForecastData, data.time),
        }
      }
    ),
  }
}

// Hours are relative to start of local day
export const SHORT_TERM_FORECAST_HOURS_TODAY = [9, 12, 15, 18, 21]
export const SHORT_TERM_FORECAST_HOURS_TOMORROW = [
  24, // start of tomorrow
  24 + 9,
  24 + 9 * 2,
  24 + 9 * 3, // to give end date range for the previous item
]

/**
 * Calculates short term forecast from FMI data points
 *
 * If for example the `forecastItemsInput` contains three dates:
 *
 *    (1) --- (2) --- (3)
 *
 * the result is array of two `ShortTermWeatherDataPoint`s, where first item represents
 * the forecast from (1) to (2) times, and second item represents forecast from (2) - (3) times.
 *
 * @param forecastTimesInput The date boundaries to calculate forecast sums from. Note! Last item is _only_ used for the boundary of last time range.
 */
export function calculateShortTermForecast(
  forecastData: FmiHarmonieDataPoint[],
  meteoForecastData: MeteoShortTermForecastResponse,
  observationData: FmiObservationDataPoint[],
  { switchDayAtHour: startForecastAtHour, timezone }: GenerateOptions,
  forecastTimesInput?: Date[]
): ShortTermWeatherDataPoint[] {
  const overlap = getOverlappingTimes(
    forecastData.map((i) => i.time),
    observationData.map((i) => i.time)
  )
  const combined = [...forecastData, ...observationData].filter((d) => {
    const isOverlapping =
      overlap.findIndex((date) => dateFns.isEqual(date, d.time)) !== -1
    if (isOverlapping && d.type === 'harmonie') {
      // When overlap is found, drop forecast data points (observations are preferred)
      return false
    }

    return true
  })

  logger.info('calculateShortTermForecast overlap', overlap)
  logger.info('calculateShortTermForecast forecastData', forecastData)
  logger.info('calculateShortTermForecast observationData', observationData)
  logger.info('calculateShortTermForecast meteoForecastData', meteoForecastData)

  const { startOfLocalDayInUtc } = getTodayDates(startForecastAtHour, timezone)

  _.range(0, 24).forEach((h) => {
    const isHourData = combined.some((d) =>
      dateFns.isEqual(d.time, dateFns.addHours(startOfLocalDayInUtc, h))
    )
    if (!isHourData && process.env.NODE_ENV !== 'test') {
      throw new Error(`Missing observation and forecast data for hour ${h}`)
    }
  })

  const forecastTimes = forecastTimesInput
    ? forecastTimesInput
    : [
        ...SHORT_TERM_FORECAST_HOURS_TODAY,
        ...SHORT_TERM_FORECAST_HOURS_TOMORROW,
      ].map((h) => dateFns.addHours(startOfLocalDayInUtc, h))
  logger.debug('calculateShortTermForecast forecastTimes', forecastTimes)

  return _.take(forecastTimes, forecastTimes.length - 1).map((time, index) => {
    const foundForecast = forecastData.find((d) =>
      dateFns.isEqual(d.time, time)
    )
    const foundObs = observationData.find((d) => dateFns.isEqual(d.time, time))
    if (!foundForecast && !foundObs) {
      // Throw if we can't find the exact data point. It should be there so this might indicate incorrect forecast/observation data.
      logger.error('Time:', time.toISOString())
      logger.error('FMI forecast:', forecastData)
      logger.error('FMI observations:', observationData)
      throw new Error(
        `Could not find FMI forecast/observation data point for date ${time.toISOString()}`
      )
    }
    const foundMeteoHourData = attrsByTime(meteoForecastData.hourly).find((d) =>
      dateFns.isEqual(d.time, time)
    )

    const nextIndex = index + 1
    const nextTime = forecastTimes[nextIndex]
    const fmiDataBetweenNext = combined.filter(
      (f) =>
        dateFns.isEqual(f.time, time) ||
        (dateFns.isAfter(f.time, time) && dateFns.isBefore(f.time, nextTime))
    )
    return calculateShortTermDataPoint(
      time,
      fmiDataBetweenNext,
      foundMeteoHourData
    )
  })
}

function getOverlappingTimes(dates1: Date[], dates2: Date[]) {
  return _.intersectionWith(dates1, dates2, dateFns.isEqual)
}

function calculateShortTermDataPoint(
  time: Date,
  data: (FmiHarmonieDataPoint | FmiObservationDataPoint)[],
  foundMeteoData?: { time: Date; weathercode: MeteoWeatherCode }
): ShortTermWeatherDataPoint {
  const forecasts = data.filter(
    (d): d is FmiHarmonieDataPoint => d.type === 'harmonie'
  )

  const exactMatch = data.find((f) => dateFns.isEqual(f.time, time))
  if (!exactMatch) {
    throw new Error(
      `Unexpected: exact match not found for time ${time.toISOString()}`
    )
  }

  const baseData = {
    time,
    // Averages could be used here to give a sense of the weather between e.g.
    // 12 - 15:00. However after using the average temperatures for a while, it
    // felt that the temperatures don't fluctuate as much as they "should" compared
    // to my weather app. It's easy to interpolation between the 12 and 15:00 forecasts
    // so having the exact values during that hour makes sense.
    temperature: exactMatch.Temperature,
    windSpeedMs: exactMatch.WindSpeedMS,
    precipitation1h: exactMatch.Precipitation1h,
    // Note! Assumes 60min timesteps within forecast data
    precipitationAmountFromNowToNext: sumByOrNull(
      data,
      (f) => f.Precipitation1h
    ),
  }
  if (forecasts.length === 0) {
    if (!foundMeteoData) {
      throw new Error(
        `Meteo data for hour ${time} not found for observation data`
      )
    }

    return {
      ...baseData,
      type: 'observation',
      symbol: meteoToFmiWeatherSymbolNumber(foundMeteoData.weathercode),
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const symbol = forecasts[0]!.WeatherSymbol3
  if (!(symbol in weatherSymbolDescriptions)) {
    throw new Error(`Unexpected WeatherSymbol3: ${symbol}`)
  }

  // When dealing with mixture of data, we return the whole data point still as forecast
  // This way we get at least some weather symbol in the forecast
  return {
    ...baseData,
    type: 'forecast',
    windGustMs: Math.max(...forecasts.map((d) => d.WindGust)),
    pressure: _.mean(forecasts.map((d) => d.Pressure)),
    dewPoint: _.mean(forecasts.map((d) => d.DewPoint)),
    symbol: symbol as WeatherSymbolNumber,
  }
}

/**
 * Calculates long term forecast from FMI data points
 *
 * @see `calculateShortTermForecast` function for more explanation of returned data.
 */
export function calculateLongTermForecast(
  fmiData: FmiEcmwfDataPoint[],
  { switchDayAtHour: startForecastAtHour, timezone }: GenerateOptions,
  forecastItemsInput?: Date[]
): Omit<LongTermWeatherDataPoint, 'symbol'>[] {
  const { startOfLocalDayInUtc: start } = getTodayDates(
    startForecastAtHour,
    timezone
  )
  const forecastTimes = forecastItemsInput
    ? forecastItemsInput
    : [
        1, 2, 3, 4, 5,
        6 /* last item to give end date range for the previous item */,
      ].map((d) => dateFns.addDays(start, d))
  logger.debug('calculateLongTermForecast forecastTimes', forecastTimes)

  return _.take(forecastTimes, forecastTimes.length - 1).map((time, index) => {
    const fmiIndex = fmiData.findIndex((d) => dateFns.isEqual(d.time, time))
    const found = fmiData[fmiIndex]
    if (!found) {
      // Throw if we can't find the exact data point. It should be there so this might indicate incorrect forecast data.
      logger.error('Time:', time.toISOString())
      logger.error('FMI Data:', JSON.stringify(fmiData))
      throw new Error(
        `Could not find FMI forecast data point for date ${time.toISOString()}`
      )
    }

    const nextIndex = index + 1
    const nextTime = forecastTimes[nextIndex]
    const fmiDataBetweenNext = fmiData.filter(
      (f) =>
        dateFns.isEqual(f.time, time) ||
        (dateFns.isAfter(f.time, time) && dateFns.isBefore(f.time, nextTime))
    )

    const avgWindSpeedMs = _.mean(fmiDataBetweenNext.map((d) => d.WindSpeedMS))
    const maxWindSpeedMs = Math.max(
      ...fmiDataBetweenNext.map((d) => d.WindSpeedMS)
    )
    const minWindSpeedMs = Math.min(
      ...fmiDataBetweenNext.map((d) => d.WindSpeedMS)
    )
    const avgTemperature = _.mean(fmiDataBetweenNext.map((d) => d.Temperature))
    const maxTemperature = Math.max(
      ...fmiDataBetweenNext.map((d) => d.Temperature)
    )
    const minTemperature = Math.min(
      ...fmiDataBetweenNext.map((d) => d.Temperature)
    )

    return {
      time,
      avgTemperature,
      minTemperature,
      maxTemperature,
      avgWindSpeedMs,
      minWindSpeedMs,
      maxWindSpeedMs,
      // Note! Assumes 60min timesteps within forecast data
      precipitationAmountFromNowToNext: sumByOrNull(
        fmiDataBetweenNext,
        (f) => f.Precipitation1h
      ),
    }
  })
}

export function calculateTodaySummaryFromFmiData(
  fmiData: FmiHarmonieDataPoint[],
  fmiObservationData: FmiObservationDataPoint[],
  { location, switchDayAtHour: startForecastAtHour, timezone }: GenerateOptions
): Omit<WeatherTodaySummary, 'forecast'> & {
  forecast: Omit<WeatherTodaySummary['forecast'], 'maxUvIndex'>
} {
  const { startOfLocalDayInUtc, endOfLocalDayInUtc } = getTodayDates(
    startForecastAtHour,
    timezone
  )
  const fmiObservationsDataToday = fmiObservationData.filter((d) =>
    isBetweenInclusive(d.time, startOfLocalDayInUtc, endOfLocalDayInUtc)
  )
  const fmiForecastDataToday = fmiData.filter((d) => {
    const isBetween = isBetweenInclusive(
      d.time,
      startOfLocalDayInUtc,
      endOfLocalDayInUtc
    )
    const isInObservations =
      fmiObservationsDataToday.findIndex((obs) =>
        dateFns.isEqual(obs.time, d.time)
      ) !== -1
    return isBetween && !isInObservations
  })

  const combined = [...fmiForecastDataToday, ...fmiObservationsDataToday]

  const maxWindGustMs = Math.max(...fmiForecastDataToday.map((d) => d.WindGust))
  const avgWindSpeedMs = _.mean(fmiForecastDataToday.map((d) => d.WindSpeedMS))
  const maxWindSpeedMs = Math.max(
    ...fmiForecastDataToday.map((d) => d.WindSpeedMS)
  )
  const minWindSpeedMs = Math.min(
    ...fmiForecastDataToday.map((d) => d.WindSpeedMS)
  )
  const avgTemperature = _.mean(fmiForecastDataToday.map((d) => d.Temperature))
  const maxTemperature = Math.max(
    ...fmiForecastDataToday.map((d) => d.Temperature)
  )
  const minTemperature = Math.min(
    ...fmiForecastDataToday.map((d) => d.Temperature)
  )
  const symbolCounts = _.countBy(fmiForecastDataToday, (d) => d.WeatherSymbol3)
  const symbolCountsArr = Object.keys(symbolCounts).map((key) => ({
    key,
    value: symbolCounts[key],
  }))
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const { key: topSymbol } = _.maxBy(symbolCountsArr, ({ value }) => value)!
  const symbol = Number(topSymbol) as WeatherSymbolNumber

  // Note! Assumes 60min timesteps within forecast data
  const precipitationAmount = sumByOrNull(
    fmiForecastDataToday,
    (d) => d.Precipitation1h
  )
  const sunrise = getSunrise(location.lat, location.lon, startOfLocalDayInUtc)
  const sunset = getSunset(location.lat, location.lon, startOfLocalDayInUtc)

  return {
    sunrise,
    sunset,
    dayDurationInSeconds: dateFns.differenceInSeconds(sunset, sunrise),
    all: {
      minTemperature: Math.min(...combined.map((d) => d.Temperature)),
      maxTemperature: Math.max(...combined.map((d) => d.Temperature)),
    },
    forecast: {
      avgTemperature,
      minTemperature,
      maxTemperature,
      avgWindSpeedMs,
      minWindSpeedMs,
      maxWindSpeedMs,
      maxWindGustMs,
      description: weatherSymbolDescriptions[symbol],
      symbol,
      precipitationAmount,
    },
  }
}

function findHighestUVIndex(
  forecast: MeteoAirQualityForecastResponse,
  { switchDayAtHour: startForecastAtHour, timezone }: GenerateOptions
): MaxUvIndex {
  const { startOfLocalDayInUtc, endOfLocalDayInUtc } = getTodayDates(
    startForecastAtHour,
    timezone
  )
  const hoursToday = attrsByTime(forecast.hourly).filter(({ time }) =>
    isBetweenInclusive(time, startOfLocalDayInUtc, endOfLocalDayInUtc)
  )
  logger.debug('findHighestUVIndex: uv index and hours', hoursToday)

  const maxHour = _.maxBy(hoursToday, ({ uv_index }) => uv_index)
  if (!maxHour) {
    throw new Error('Unable to find max UV index for day')
  }
  return {
    time: maxHour.time,
    value: maxHour.uv_index,
  }
}

function findWeatherSymbolForDay(
  forecast: MeteoLongTermForecastResponse,
  time: Date
): WeatherSymbolNumber {
  const dates = forecast.daily.time.map((time, index) => ({
    time,
    index,
  }))

  // Take DST into account when finding matching date
  const found = dates.find(
    (d) =>
      dateFns.differenceInSeconds(d.time, time) <= dateFns.hoursToSeconds(1)
  )
  if (!found) {
    logger.error('Unable to find matching date', {
      dates,
      time,
    })
    throw new Error('Unable to find matching date from meteo forecast')
  }

  return meteoToFmiWeatherSymbolNumber(forecast.daily.weathercode[found.index])
}

function isBetweenInclusive(time: Date, start: Date, end: Date): boolean {
  return (
    (dateFns.isAfter(time, start) || dateFns.isEqual(time, start)) &&
    (dateFns.isBefore(time, end) || dateFns.isEqual(time, end))
  )
}
