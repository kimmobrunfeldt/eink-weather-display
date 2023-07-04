import * as dateFns from 'date-fns'
import _ from 'lodash'
import { GenerateOptions } from 'src/rendering/core'
import {
  LocalWeather,
  LongTermWeatherDataPoint,
  ShortTermWeatherDataPoint,
  WeatherSymbolNumber,
} from 'src/types'

import { weatherSymbolDescriptions } from 'src/weather/weatherSymbol'

export async function generateRandomLocalWeatherData(
  opts: GenerateOptions
): Promise<LocalWeather> {
  const symbol = randomSymbol()
  return {
    todaySummary: {
      sunrise: randomDate(365),
      sunset: randomDate(365),
      dayDurationInSeconds: _.random(0, 24, true) * 3600,
      all: {
        ...randomMinMaxAvgTemperature(),
      },
      forecast: {
        ...randomMinMaxAvgTemperature(),
        ...randomMinMaxAvgWindSpeed(),
        maxWindGustMs: randomMinMaxAvgWindSpeed().maxWindSpeedMs,
        symbol,
        description: weatherSymbolDescriptions[symbol],
        maxUvIndex: {
          time: randomDate(365),
          value: _.random(0, 12, true),
        },
        precipitationAmount: randomPrecipitation1h() * 24,
      },
    },
    forecastShortTerm: _.range(8).map(() =>
      generateRandomShortTermDataPoint(opts)
    ),
    hourlyDataPoints: _.range(60).map(() =>
      generateRandomShortTermDataPoint(opts)
    ),
    forecastLongTerm: _.range(6).map(() =>
      generateRandomLongTermDataPoint(opts)
    ),
  }
}

function generateRandomShortTermDataPoint(
  _opts: GenerateOptions
): ShortTermWeatherDataPoint {
  return {
    type: 'forecast',
    time: randomDate(365 * 2),
    temperature: randomTemperature(),
    ...randomWind(),
    pressure: randomPressure(),
    precipitationAmountFromNowToNext: randomPrecipitation1h(), // not the best simulation... but ok
    precipitation1h: randomPrecipitation1h(),
    dewPoint: randomTemperature(),
    symbol: randomSymbol(),
  }
}

function generateRandomLongTermDataPoint(
  _opts: GenerateOptions
): LongTermWeatherDataPoint {
  return {
    time: randomDate(365 * 2),
    ...randomMinMaxAvgTemperature(),
    ...randomMinMaxAvgWindSpeed(),
    precipitationAmountFromNowToNext: randomPrecipitation1h() * 24,
    symbol: randomSymbol(),
  }
}

const randomDate = (dayVariance: number) =>
  dateFns.addSeconds(
    new Date(),
    _.random(-dayVariance * 24 * 60 * 60, dayVariance * 24 * 60 * 60)
  )

const MAX_SENSIBLE_TEMPERATURE = 50
const randomTemperature = () =>
  _.random(-MAX_SENSIBLE_TEMPERATURE, MAX_SENSIBLE_TEMPERATURE, true)

const MAX_SENSIBLE_WIND_SPEED = 35
const MAX_SENSIBLE_GUST_SPEED = 55
const randomWind = () => ({
  windSpeedMs: _.random(0.0, MAX_SENSIBLE_WIND_SPEED, true),
  windGustMs: _.random(0.0, MAX_SENSIBLE_GUST_SPEED, true),
})
const randomMinMaxAvgWindSpeed = () => {
  const minWindSpeedMs = randomWind().windSpeedMs
  const maxWindSpeedMs =
    minWindSpeedMs + _.random(0, MAX_SENSIBLE_WIND_SPEED - minWindSpeedMs)
  return {
    avgWindSpeedMs: (maxWindSpeedMs + minWindSpeedMs) / 2,
    minWindSpeedMs,
    maxWindSpeedMs,
  }
}
const randomMinMaxAvgTemperature = () => {
  const minTemperature = randomTemperature()
  const maxTemperature =
    minTemperature + _.random(0, MAX_SENSIBLE_TEMPERATURE - minTemperature)
  return {
    avgTemperature: (maxTemperature + minTemperature) / 2,
    minTemperature,
    maxTemperature,
  }
}
const randomPressure = () => _.random(900, 1100, true)
const randomPrecipitation1h = () => _.random(0, 100, true)
const randomSymbol = (): WeatherSymbolNumber =>
  Number(
    _.sample(Object.keys(weatherSymbolDescriptions)!)
  ) as WeatherSymbolNumber
