import * as dateFns from 'date-fns'
import _ from 'lodash'
import { GenerateOptions } from 'src/rendering/core'
import {
  LocalWeather,
  LongTermWeatherDataPoint,
  MaxUvIndex,
  ShortTermWeatherDataPoint,
  WeatherSymbolNumber,
  WeatherTodaySummary,
} from 'src/types'
import { logger } from 'src/utils/logger'
import { getNextHourDates, sumByOrNull } from 'src/utils/utils'
import {
  fetchFmiEcmwfData,
  fetchFmiHarmonieData,
  FmiEcmwfDataPoint,
  FmiHarmonieDataPoint,
} from 'src/weather/fmiApi'
import {
  fetchMeteoAirQualityForecast,
  fetchMeteoForecast,
  MeteoAirQualityForecastResponse,
  MeteoForecastResponse,
} from 'src/weather/meteoApi'
import {
  meteoToFmiWeatherSymbolNumber,
  weatherSymbolDescriptions,
} from 'src/weather/weatherSymbol'
import { getSunrise, getSunset } from 'sunrise-sunset-js'

export async function getLocalWeatherData(
  opts: GenerateOptions
): Promise<LocalWeather> {
  logger.debug(
    'getNextHourDates',
    getNextHourDates(opts.startForecastAtHour, opts.timezone)
  )

  const fmiHarmonieData = await fetchFmiHarmonieData(opts)
  const fmiEcmwfData = await fetchFmiEcmwfData(opts)
  const meteoForecastData = await fetchMeteoForecast(opts)
  const meteoAirQualityForecastData = await fetchMeteoAirQualityForecast(opts)

  const maxUv = findHighestUVIndex(meteoAirQualityForecastData, opts)
  const todaySummary = calculateTodaySummaryFromFmiData(fmiHarmonieData, opts)
  return {
    todaySummary: { ...todaySummary, maxUvIndex: maxUv },
    forecastShortTerm: calculateShortTermForecast(fmiHarmonieData, opts),
    forecastLongTerm: calculateLongTermForecast(fmiEcmwfData, opts).map(
      (data) => {
        return {
          ...data,
          symbol: findWeatherSymbolForDay(meteoForecastData, data.time),
        }
      }
    ),
  }
}

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
  fmiData: FmiHarmonieDataPoint[],
  { startForecastAtHour, timezone }: GenerateOptions,
  forecastTimesInput?: Date[]
): ShortTermWeatherDataPoint[] {
  const { hourInUtc: start } = getNextHourDates(startForecastAtHour, timezone)
  const forecastTimes = forecastTimesInput
    ? forecastTimesInput
    : [
        0,
        3,
        6,
        9,
        12,
        15, // end of day, when forecast starts at 9AM
        15 + 9,
        15 + 9 * 2,
        15 + 9 * 3, // to give end date range for the previous item
      ].map((h) => dateFns.addHours(start, h))
  logger.debug('calculateShortTermForecast forecastTimes', forecastTimes)

  return _.take(forecastTimes, forecastTimes.length - 1).map((time, index) => {
    const fmiIndex = fmiData.findIndex((d) => dateFns.isEqual(d.time, time))
    const found = fmiData[fmiIndex]
    if (!found) {
      // Throw if we can't find the exact data point. It should be there so this might indicate incorrect forecast data.
      logger.error('Time:', time)
      logger.error('FMI Data:', JSON.stringify(fmiData))
      throw new Error(`Could not find FMI forecast data point for date ${time}`)
    }
    const symbol = found.WeatherSymbol3
    if (!(symbol in weatherSymbolDescriptions)) {
      logger.error('FMI Data:', JSON.stringify(fmiData))
      logger.error('Found:', JSON.stringify(found))
      throw new Error(`Unexpected WeatherSymbol3: ${symbol}`)
    }

    const nextIndex = index + 1
    const nextTime = forecastTimes[nextIndex]
    const fmiDataBetweenNext = fmiData.filter(
      (f) =>
        dateFns.isEqual(f.time, time) ||
        (dateFns.isAfter(f.time, time) && dateFns.isBefore(f.time, nextTime))
    )
    return {
      time,
      temperature: _.mean(fmiDataBetweenNext.map((d) => d.Temperature)),
      windSpeedMs: _.mean(fmiDataBetweenNext.map((d) => d.WindSpeedMS)),
      windGustMs: _.mean(fmiDataBetweenNext.map((d) => d.WindGust)),
      pressure: _.mean(fmiDataBetweenNext.map((d) => d.Pressure)),
      // Note! Assumes 60min timesteps within forecast data
      precipitationAmountFromNowToNext: sumByOrNull(
        fmiDataBetweenNext,
        (f) => f.Precipitation1h
      ),
      precipitation1h: found.Precipitation1h,
      dewPoint: _.mean(fmiDataBetweenNext.map((d) => d.DewPoint)),
      symbol: found.WeatherSymbol3 as WeatherSymbolNumber,
    }
  })
}

/**
 * Calculates long term forecast from FMI data points
 *
 * @see `calculateShortTermForecast` function for more explanation of returned data.
 */
export function calculateLongTermForecast(
  fmiData: FmiEcmwfDataPoint[],
  { startForecastAtHour, timezone }: GenerateOptions,
  forecastItemsInput?: Date[]
): Omit<LongTermWeatherDataPoint, 'symbol'>[] {
  const { startOfLocalDayInUtc: start } = getNextHourDates(
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
      logger.error('Time:', time)
      logger.error('FMI Data:', JSON.stringify(fmiData))
      throw new Error(`Could not find FMI forecast data point for date ${time}`)
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
  { location, startForecastAtHour, timezone }: GenerateOptions
): Omit<WeatherTodaySummary, 'maxUvIndex'> {
  const {
    hourInUtc: nextH,
    startOfLocalDayInUtc,
    endOfLocalDayInUtc,
  } = getNextHourDates(startForecastAtHour, timezone)
  const today = fmiData.filter((d) =>
    isBetweenInclusive(d.time, startOfLocalDayInUtc, endOfLocalDayInUtc)
  )
  const avgWindSpeedMs = _.mean(today.map((d) => d.WindSpeedMS))
  const maxWindSpeedMs = Math.max(...today.map((d) => d.WindSpeedMS))
  const minWindSpeedMs = Math.min(...today.map((d) => d.WindSpeedMS))
  const avgTemperature = _.mean(today.map((d) => d.Temperature))
  const maxTemperature = Math.max(...today.map((d) => d.Temperature))
  const minTemperature = Math.min(...today.map((d) => d.Temperature))
  const symbolCounts = _.countBy(today, (d) => d.WeatherSymbol3)
  const symbolCountsArr = Object.keys(symbolCounts).map((key) => ({
    key,
    value: symbolCounts[key],
  }))
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const { key: topSymbol } = _.maxBy(symbolCountsArr, ({ value }) => value)!
  const symbol = Number(topSymbol) as WeatherSymbolNumber

  // Note! Assumes 60min timesteps within forecast data
  const precipitationAmount = sumByOrNull(today, (d) => d.Precipitation1h)
  const sunrise = getSunrise(location.lat, location.lon, nextH)
  const sunset = getSunset(location.lat, location.lon, nextH)

  return {
    avgTemperature,
    minTemperature,
    maxTemperature,
    avgWindSpeedMs,
    minWindSpeedMs,
    maxWindSpeedMs,
    description: weatherSymbolDescriptions[symbol],
    symbol,
    sunrise,
    sunset,
    dayDurationInSeconds: dateFns.differenceInSeconds(sunset, sunrise),
    precipitationAmount,
  }
}

function findHighestUVIndex(
  forecast: MeteoAirQualityForecastResponse,
  { startForecastAtHour, timezone }: GenerateOptions
): MaxUvIndex {
  const { startOfLocalDayInUtc, endOfLocalDayInUtc } = getNextHourDates(
    startForecastAtHour,
    timezone
  )
  const hoursToday = forecast.hourly.time
    .map((time, index) => ({
      time: new Date(time),
      uvIndex: forecast.hourly.uv_index[index],
    }))
    .filter(({ time }) =>
      isBetweenInclusive(time, startOfLocalDayInUtc, endOfLocalDayInUtc)
    )

  logger.debug('findHighestUVIndex: uv index and hours', hoursToday)

  const maxHour = _.maxBy(hoursToday, ({ uvIndex }) => uvIndex)
  if (!maxHour) {
    throw new Error('Unable to find max UV index for day')
  }
  return {
    time: maxHour.time,
    value: maxHour.uvIndex,
  }
}

function findWeatherSymbolForDay(
  forecast: MeteoForecastResponse,
  time: Date
): WeatherSymbolNumber {
  const dates = forecast.daily.time.map((time, index) => ({
    time,
    index,
  }))

  const found = dates.find((d) => dateFns.isEqual(d.time, time))
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
