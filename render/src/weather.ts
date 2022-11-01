import axios from 'axios'
import * as dateFns from 'date-fns'
import { XMLParser } from 'fast-xml-parser'
import * as fs from 'fs'
import _ from 'lodash'
import * as path from 'path'
import { writeDebugFileSync } from 'src/utils'
import { getSunrise, getSunset } from 'sunrise-sunset-js'

export const START_FORECAST_HOUR = 9

export type Coordinate = {
  lat: number
  lon: number
}

type MaxUvIndex = {
  value: number
  time: Date
}

type WeatherTodaySummary = {
  avgTemperature: number
  minTemperature: number
  maxTemperature: number
  avgWindSpeedMs: number
  minWindSpeedMs: number
  maxWindSpeedMs: number
  symbol: WeatherSymbolNumber
  description: string
  sunrise: Date
  sunset: Date
  dayDurationInSeconds: number
  maxUvIndex: MaxUvIndex
  precipitationAmount: number | null
}

// All numbers should be nullable to treat NaN returned by FMI API in type-safe manner...
// ...but that's a bit more work.
type ShortTermWeatherDataPoint = {
  time: Date
  temperature: number
  windSpeedMs: number
  windGustMs: number
  pressure: number
  precipitationAmountFromNowToNext: number | null
  precipitation1h: number
  dewPoint: number
  symbol: WeatherSymbolNumber
}

type LongTermWeatherDataPoint = {
  time: Date
  avgTemperature: number
  minTemperature: number
  maxTemperature: number
  avgWindSpeedMs: number
  minWindSpeedMs: number
  maxWindSpeedMs: number
  precipitationAmountFromNowToNext: number | null
  symbol: WeatherSymbolNumber
}

export type LocalWeather = {
  todaySummary: WeatherTodaySummary
  forecastShortTerm: ShortTermWeatherDataPoint[]
  forecastLongTerm: LongTermWeatherDataPoint[]
}

const API_URL = 'http://opendata.fmi.fi/wfs'

export async function getLocalWeatherData({
  location,
}: {
  location: Coordinate
}): Promise<LocalWeather> {
  const harmonieRes = await axios.get(API_URL, {
    params: getFmiHarmonieParameters(location),
  })
  writeDebugFileSync('fmi-harmonie-response.xml', harmonieRes.data)
  const fmiHarmonieData = parseWeatherTodayXmlResponse<FmiHarmonieDataPoint>(
    harmonieRes.data
  )
  writeDebugFileSync('fmi-harmonie-parsed-data.json', fmiHarmonieData)

  const ecmwfRes = await axios.get(API_URL, {
    params: getFmiECMWFParameters(location),
  })
  writeDebugFileSync('fmi-ecmwf-response.xml', harmonieRes.data)
  const fmiEcmwfData = parseWeatherTodayXmlResponse<FmiECMWFDataPoint>(
    ecmwfRes.data
  )
  writeDebugFileSync('fmi-harmonie-parsed-data.json', fmiHarmonieData)

  const todaySummary = calculateTodaySummary(fmiHarmonieData, location)
  return {
    todaySummary,
    forecastShortTerm: calculateShortTermForecast(fmiHarmonieData),
    forecastLongTerm: calculateLongTermForecast(fmiEcmwfData).map((data) => {
      return {
        ...data,
        symbol: 1, // TODO: Get this data from another API
      }
    }),
  }
}

export function getSymbolIcon(
  symbol: WeatherSymbolNumber,
  theme: 'light' | 'dark'
): string {
  if (!(symbol in weatherSymbolIcons[theme])) {
    throw new Error(`Weather symbol not found for number: ${symbol} (${theme})`)
  }

  return `weather-icons/${weatherSymbolIcons[theme][symbol]}.svg`
}

export function getSymbolClass(
  symbol: WeatherSymbolNumber,
  theme: 'light' | 'dark'
): string {
  if (!(symbol in weatherSymbolIcons[theme])) {
    throw new Error(`Weather symbol not found for number: ${symbol} (${theme})`)
  }

  return weatherSymbolIcons[theme][symbol]
}

function calculateShortTermForecast(fmiData: FmiHarmonieDataPoint[]) {
  const start = dateFns.startOfDay(getNextHour(START_FORECAST_HOUR))
  const forecastTimes = [9, 12, 15, 18, 21, 24, 24 + 9, 24 + 9 * 2].map((h) =>
    dateFns.addHours(start, h)
  )

  return forecastTimes.map((time, index) => {
    const fmiIndex = fmiData.findIndex((d) => dateFns.isEqual(d.time, time))
    const found = fmiData[fmiIndex]
    if (!found) {
      console.error('Time:', time)
      console.error('FMI Data:', JSON.stringify(fmiData))
      throw new Error(`Could not find FMI forecast data point for date ${time}`)
    }
    const symbol = found.WeatherSymbol3
    if (!(symbol in weatherSymbolDescriptions)) {
      console.error('FMI Data:', JSON.stringify(fmiData))
      console.error('Found:', JSON.stringify(found))
      throw new Error(`Unexpected WeatherSymbol3: ${symbol}`)
    }

    const nextIndex = index + 1
    const nextTime =
      nextIndex >= forecastTimes.length
        ? dateFns.addHours(start, 24 + 9 * 3) // for the last item, keep the same +9h interval
        : forecastTimes[nextIndex]
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
      precipitationAmountFromNowToNext: sumByOrNull(
        fmiDataBetweenNext,
        (f) => f.PrecipitationAmount
      ),
      precipitation1h: found.Precipitation1h,
      dewPoint: _.mean(fmiDataBetweenNext.map((d) => d.DewPoint)),
      symbol: found.WeatherSymbol3 as WeatherSymbolNumber,
    }
  })
}

function calculateLongTermForecast(fmiData: FmiECMWFDataPoint[]) {
  const start = dateFns.startOfDay(getNextHour(START_FORECAST_HOUR))
  const forecastTimes = [1, 2, 3, 4, 5].map((h) => dateFns.addDays(start, h))

  return forecastTimes.map((time, index) => {
    const fmiIndex = fmiData.findIndex((d) => dateFns.isEqual(d.time, time))
    const found = fmiData[fmiIndex]
    if (!found) {
      console.error('Time:', time)
      console.error('FMI Data:', JSON.stringify(fmiData))
      throw new Error(`Could not find FMI forecast data point for date ${time}`)
    }

    const nextIndex = index + 1
    const nextTime =
      nextIndex >= forecastTimes.length
        ? dateFns.addDays(start, 5) // for the last item, keep the same interval
        : forecastTimes[nextIndex]
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
    const minTemperature = Math.max(
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
      precipitationAmountFromNowToNext: sumByOrNull(
        fmiDataBetweenNext,
        (f) => f.Precipitation1h
      ),
    }
  })
}

function calculateTodaySummary(
  fmiData: FmiHarmonieDataPoint[],
  location: Coordinate
): LocalWeather['todaySummary'] {
  const nextH = getNextHour(START_FORECAST_HOUR)

  const today = fmiData.filter(
    (d) =>
      dateFns.isAfter(d.time, dateFns.startOfDay(nextH)) &&
      dateFns.isBefore(d.time, dateFns.endOfDay(nextH))
  )
  const avgWindSpeedMs = _.mean(today.map((d) => d.WindSpeedMS))
  const maxWindSpeedMs = Math.max(...today.map((d) => d.WindSpeedMS))
  const minWindSpeedMs = Math.min(...today.map((d) => d.WindSpeedMS))
  const avgTemperature = _.mean(today.map((d) => d.Temperature))
  const maxTemperature = Math.max(...today.map((d) => d.Temperature))
  const minTemperature = Math.max(...today.map((d) => d.Temperature))
  const symbolCounts = _.countBy(today, (d) => d.WeatherSymbol3)
  const symbolCountsArr = Object.keys(symbolCounts).map((key) => ({
    key,
    value: symbolCounts[key],
  }))
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const { key: topSymbol } = _.maxBy(symbolCountsArr, ({ value }) => value)!
  const symbol = Number(topSymbol) as WeatherSymbolNumber

  const precipitationAmount = sumByOrNull(today, (d) => d.PrecipitationAmount)
  const sunrise = getSunrise(
    location.lat,
    location.lon,
    dateFns.startOfDay(nextH)
  )
  const sunset = getSunset(
    location.lat,
    location.lon,
    dateFns.startOfDay(nextH)
  )
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
    maxUvIndex: { value: 2, time: new Date() }, // TODO
    precipitationAmount,
  }
}

export function getNextHour(startHour = 9) {
  const now = new Date()
  const today = dateFns.addHours(dateFns.startOfToday(), startHour)

  if (dateFns.isBefore(now, today)) {
    return today
  }

  const tomorrow = dateFns.addHours(dateFns.startOfTomorrow(), startHour)
  return tomorrow
}

function getFmiECMWFParameters(location: Coordinate) {
  const startOfNextHDay = dateFns.startOfDay(getNextHour(START_FORECAST_HOUR))
  const startDate = dateFns.addHours(startOfNextHDay, 12) // 12:00 the day after
  const endDate = dateFns.addDays(startDate, 5)
  const timeStepMin = 60

  return {
    service: 'WFS',
    version: '2.0.0',
    request: 'getFeature',
    storedquery_id: 'ecmwf::forecast::surface::point::simple',
    starttime: startDate.toISOString(),
    endtime: endDate.toISOString(),
    latlon: `${location.lat},${location.lon}`,
    timestep: timeStepMin,
    // This model returns limited data
    parameters: [
      'Temperature',
      'WindSpeedMS',
      'Pressure',
      'Precipitation1h',
    ].join(','),
    // i.e. what Google Maps uses
    crs: 'EPSG::3857', // https://en.wikipedia.org/wiki/Web_Mercator_projection#EPSG:3785
  }
}

function getFmiHarmonieParameters(location: Coordinate) {
  const startDate = getNextHour(START_FORECAST_HOUR) // 09:00
  const endDate = dateFns.addHours(startDate, 50)
  const timeStepMin = 60

  return {
    service: 'WFS',
    version: '2.0.0',
    request: 'getFeature',
    storedquery_id: 'fmi::forecast::harmonie::surface::point::simple',
    starttime: startDate.toISOString(),
    endtime: endDate.toISOString(),
    latlon: `${location.lat},${location.lon}`,
    timestep: timeStepMin,
    parameters: [
      'Temperature',
      'Humidity',
      'WindSpeedMS',
      'WindGust',
      'WindDirection',
      'Pressure',
      'Visibility',
      'PrecipitationAmount',
      'Precipitation1h',
      'DewPoint',
      'WeatherSymbol3', // https://www.ilmatieteenlaitos.fi/latauspalvelun-pikaohje
    ].join(','),
    // i.e. what Google Maps uses
    crs: 'EPSG::3857', // https://en.wikipedia.org/wiki/Web_Mercator_projection#EPSG:3785
  }
}

function sumByOrNull<T>(arr: T[], fn: (item: T) => number): number | null {
  const sum = _.sumBy(arr, fn)
  if (!_.isFinite(sum)) {
    return null
  }

  return sum
}

type FmiBaseDataPoint = {
  time: Date
  location: Coordinate
}

type FmiECMWFDataPoint = FmiBaseDataPoint & {
  Temperature: number
  Humidity: number
  WindSpeedMS: number
  Pressure: number
  Precipitation1h: number
}

type FmiHarmonieDataPoint = FmiBaseDataPoint &
  FmiECMWFDataPoint & {
    Humidity: number
    WindGust: number
    WindDirection: number
    Visibility: number
    PrecipitationAmount: number
    DewPoint: number
    WeatherSymbol3: number
  }

function parseWeatherTodayXmlResponse<
  T extends FmiHarmonieDataPoint | FmiECMWFDataPoint
>(xmlString: string): T[] {
  const parser = new XMLParser()
  const parsed = parser.parse(xmlString)
  const dataPoints = parseMembersFromRoot(parsed).map(parseMember)
  const byTime = _.groupBy(dataPoints, 'time')
  return Object.keys(byTime).map((key) => {
    const byTimeDataPoints = byTime[key]
    const values = byTimeDataPoints.reduce((memo, curr) => {
      return {
        ...memo,
        [curr.name]: Number(curr.value),
      }
    }, {} as Record<string, number>)

    return {
      ...values,
      time: dateFns.parseISO(key),
      location: byTimeDataPoints[0].location,
    } as T
  })
}

function parseMembersFromRoot(parsed: any): Record<string, any>[] {
  if (!('wfs:FeatureCollection' in parsed)) {
    throw new Error(`XML validation error: ['wfs:FeatureCollection'] missing`)
  }
  const collection = parsed['wfs:FeatureCollection']
  if (!('wfs:member' in collection)) {
    throw new Error(
      `XML validation error: ['wfs:FeatureCollection']['wfs:member'] missing`
    )
  }

  return collection['wfs:member']
}

function parseMember(member: Record<string, any>): {
  location: Coordinate
  time: string
  name: string
  value: string
} {
  if (!('BsWfs:BsWfsElement' in member)) {
    throw new Error(`XML validation error: ['BsWfs:BsWfsElement'] missing`)
  }

  const values = member['BsWfs:BsWfsElement']
  const [lat, lon] = values['BsWfs:Location']['gml:Point']['gml:pos'].split(' ')
  return {
    location: { lat: Number(lat), lon: Number(lon) },
    time: values['BsWfs:Time'],
    name: values['BsWfs:ParameterName'],
    value: values['BsWfs:ParameterValue'],
  }
}

type WeatherSymbolNumber = keyof typeof weatherSymbolIcons['light']

const weatherSymbolIcons = {
  light: {
    1: 'wi-day-sunny', // 'Clear',
    2: 'wi-day-cloudy', // 'Partly cloudy',
    3: 'wi-cloudy', // 'Cloudy',
    21: 'wi-day-showers', // 'Scattered showers',
    22: 'wi-showers', // 'Showers',
    23: 'wi-rain-mix', // 'Heavy showers',
    31: 'wi-day-sprinkle', // 'Light showers',
    32: 'wi-day-rain', // 'Moderate rain',
    33: 'wi-rain', // 'Heavy rain',
    41: 'wi-day-snow', // 'Light snow showers',
    42: 'wi-day-snow', // 'Snow showers',
    43: 'wi-day-snow-wind', // 'Heavy snow showers',
    51: 'wi-day-snow', // 'Light snowfall',
    52: 'wi-day-snow', // 'Moderate snowfall',
    53: 'wi-day-snow', // 'Heavy snowfall',
    61: 'wi-day-storm-showers', // 'Thundershowers',
    62: 'wi-day-storm-showers', // 'Heavy thundershowers',
    63: 'wi-day-lightning', // 'Thunder',
    64: 'wi-day-thunderstorm', // 'Heavy thunder',
    71: 'wi-day-sleet', // 'Light sleet showers',
    72: 'wi-day-sleet', // 'Moderate sleet showers',
    73: 'wi-day-rain-mix', // 'Heavy sleet showers',
    81: 'wi-day-sleet', // 'Light sleet',
    82: 'wi-day-sleet', // 'Moderate sleet',
    83: 'wi-sleet', // 'Heavy sleet',
    91: 'wi-day-haze', // 'Mist',
    92: 'wi-fog', // 'Fog',
  },
  dark: {
    1: 'wi-night-clear', // 'Clear',
    2: 'wi-night-alt-cloudy', // 'Partly cloudy',
    3: 'wi-cloudy', // 'Cloudy',
    21: 'wi-night-alt-showers', // 'Scattered showers',
    22: 'wi-showers', // 'Showers',
    23: 'wi-rain-mix', // 'Heavy showers',
    31: 'wi-night-alt-sprinkle', // 'Light showers',
    32: 'wi-night-alt-rain', // 'Moderate rain',
    33: 'wi-rain', // 'Heavy rain',
    41: 'wi-night-alt-snow', // 'Light snow showers',
    42: 'wi-night-alt-snow', // 'Snow showers',
    43: 'wi-night-alt-snow-wind', // 'Heavy snow showers',
    51: 'wi-night-alt-snow', // 'Light snowfall',
    52: 'wi-night-alt-snow', // 'Moderate snowfall',
    53: 'wi-night-alt-snow', // 'Heavy snowfall',
    61: 'wi-night-alt-storm-showers', // 'Thundershowers',
    62: 'wi-night-alt-storm-showers', // 'Heavy thundershowers',
    63: 'wi-night-alt-lightning', // 'Thunder',
    64: 'wi-night-alt-thunderstorm', // 'Heavy thunder',
    71: 'wi-night-alt-sleet', // 'Light sleet showers',
    72: 'wi-night-alt-sleet', // 'Moderate sleet showers',
    73: 'wi-night-alt-rain-mix', // 'Heavy sleet showers',
    81: 'wi-night-alt-sleet', // 'Light sleet',
    82: 'wi-night-alt-sleet', // 'Moderate sleet',
    83: 'wi-sleet', // 'Heavy sleet',
    91: 'wi-dust', // 'Mist',
    92: 'wi-fog', // 'Fog',
  },
}

const weatherSymbolDescriptions = {
  1: 'Clear',
  2: 'Partly cloudy',
  3: 'Cloudy',
  21: 'Scattered showers',
  22: 'Showers',
  23: 'Heavy showers',
  31: 'Light showers',
  32: 'Moderate rain',
  33: 'Heavy rain',
  41: 'Light snow showers',
  42: 'Snow showers',
  43: 'Heavy snow showers',
  51: 'Light snowfall',
  52: 'Moderate snowfall',
  53: 'Heavy snowfall',
  61: 'Thundershowers',
  62: 'Heavy thundershowers',
  63: 'Thunder',
  64: 'Heavy thunder',
  71: 'Light sleet showers',
  72: 'Moderate sleet showers',
  73: 'Heavy sleet showers',
  81: 'Light sleet',
  82: 'Moderate sleet',
  83: 'Heavy sleet',
  91: 'Mist',
  92: 'Fog',
}

// Validations

Object.keys(weatherSymbolDescriptions).forEach((symbol) => {
  if (!(symbol in weatherSymbolIcons['light'])) {
    throw new Error(`${symbol} missing from light weather icons object`)
  }
  if (!(symbol in weatherSymbolIcons['dark'])) {
    throw new Error(`${symbol} missing from dark weather icons object`)
  }
})

Object.keys(weatherSymbolIcons['light']).forEach((symbol: any) => {
  const icon = weatherSymbolIcons['light'][symbol as WeatherSymbolNumber]
  if (
    !fs.existsSync(
      path.join(__dirname, 'templates/weather-icons/', `${icon}.svg`)
    )
  ) {
    throw new Error(`${icon}.svg not found from weather-icons/ directory`)
  }
})

Object.keys(weatherSymbolIcons['dark']).forEach((symbol: any) => {
  const icon = weatherSymbolIcons['dark'][symbol as WeatherSymbolNumber]
  if (
    !fs.existsSync(
      path.join(__dirname, 'templates/weather-icons/', `${icon}.svg`)
    )
  ) {
    throw new Error(`${icon}.svg not found from weather-icons/ directory`)
  }
})
