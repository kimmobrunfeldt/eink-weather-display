import axios from 'axios'
import * as dateFns from 'date-fns'
import { XMLParser } from 'fast-xml-parser'
import _ from 'lodash'
import { writeDebugFileSync } from 'src/utils'
import { getSunrise, getSunset } from 'sunrise-sunset-js'

export const START_FORECAST_HOUR = 9

type Coordinate = {
  lat: number
  lon: number
}

type WeatherTodaySummary = {
  minTemperature: number
  maxTemperature: number
  minWindMs: number
  maxWindMs: number
  symbol: WeatherSymbolNumber
  description: string
  sunrise: Date
  sunset: Date
  dayDurationInSeconds: number
  maxUvIndex: number
  precipitationAmount: number
}

type WeatherDataPoint = {
  time: Date
  temperature: number
  windSpeedMs: number
  windGustMs: number
  pressure: number
  precipitationAmountFromNowToNext: number
  precipitation1h: number
  dewPoint: number
  symbol: WeatherSymbolNumber
}

export type LocalWeather = {
  todaySummary: WeatherTodaySummary
  forecast: WeatherDataPoint[]
}

type ForecastType = 'today' | '5days'

const API_URL = 'http://opendata.fmi.fi/wfs'

export async function getLocalWeatherData({
  location,
  type,
}: {
  location: Coordinate
  type: ForecastType
}): Promise<LocalWeather> {
  const res = await axios.get(API_URL, {
    params: getFmiParameters(location, type),
  })
  writeDebugFileSync('fmi-response.xml', res.data)

  const fmiData = parseWeatherTodayXmlResponse(res.data)
  writeDebugFileSync('parsed-fmi-data.json', fmiData)

  const todaySummary = calculateTodaySummary(fmiData, location)
  return {
    todaySummary,
    forecast: calculateTodayForecast(fmiData),
  }
}

export function getSymbolIcon(
  symbol: WeatherSymbolNumber,
  theme: 'light' | 'dark'
): string {
  if (!(symbol in weatherSymbols[theme])) {
    throw new Error(`Weather symbol not found for number: ${symbol} (${theme})`)
  }

  return weatherSymbols[theme][symbol]
}

function calculateTodayForecast(fmiData: FmiDataPoint[]) {
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
      temperature: found.Temperature,
      windSpeedMs: found.WindSpeedMS,
      windGustMs: found.WindGust,
      pressure: found.Pressure,
      precipitationAmountFromNowToNext: _.sumBy(
        fmiDataBetweenNext,
        (f) => f.PrecipitationAmount
      ),
      precipitation1h: found.Precipitation1h,
      dewPoint: found.DewPoint,
      symbol: found.WeatherSymbol3 as WeatherSymbolNumber,
    }
  })
}

function calculateTodaySummary(
  fmiData: FmiDataPoint[],
  location: Coordinate
): LocalWeather['todaySummary'] {
  const nextH = getNextHour(START_FORECAST_HOUR)

  const today = fmiData.filter(
    (d) =>
      dateFns.isAfter(d.time, dateFns.startOfDay(nextH)) &&
      dateFns.isBefore(d.time, dateFns.endOfDay(nextH))
  )
  const maxWindMs = Math.max(...today.map((d) => d.WindSpeedMS))
  const minWindMs = Math.min(...today.map((d) => d.WindSpeedMS))
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

  const precipitationAmount = _.sumBy(today, (d) => d.PrecipitationAmount)
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
    minTemperature,
    maxTemperature,
    minWindMs,
    maxWindMs,
    description: weatherSymbolDescriptions[symbol],
    symbol,
    sunrise,
    sunset,
    dayDurationInSeconds: dateFns.differenceInSeconds(sunset, sunrise),
    maxUvIndex: 2, // TODO
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

function getDateParameters(type: ForecastType): {
  startDate: Date
  endDate: Date
  timeStepMin: number
} {
  switch (type) {
    case 'today': {
      const startDate = getNextHour(START_FORECAST_HOUR) // 09:00
      return {
        startDate,
        timeStepMin: 60,
        endDate: dateFns.addHours(startDate, 50),
      }
    }

    case '5days': {
      const startDate = dateFns.addHours(dateFns.startOfTomorrow(), 12)
      // Tomorrow 12:00
      return {
        startDate,
        timeStepMin: 60 * 24,
        endDate: dateFns.addDays(startDate, 5),
      }
    }
  }
}

function getFmiParameters(location: Coordinate, type: ForecastType) {
  const { startDate, endDate, timeStepMin } = getDateParameters(type)

  return {
    service: 'WFS',
    version: '2.0.0',
    request: 'getFeature',
    storedquery_id: 'fmi::forecast::harmonie::surface::point::simple',
    starttime: startDate.toISOString(),
    endtime: endDate.toISOString(),
    latlon: `${location.lat},${location.lon}`,
    timestep: timeStepMin,
    // Comment this parameter to see unfiltered fields
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

type FmiDataPoint = {
  time: Date
  Temperature: number
  location: Coordinate
  Humidity: number
  WindSpeedMS: number
  WindGust: number
  WindDirection: number
  Pressure: number
  Visibility: number
  PrecipitationAmount: number
  Precipitation1h: number
  DewPoint: number
  WeatherSymbol3: number
}

function parseWeatherTodayXmlResponse(xmlString: string): FmiDataPoint[] {
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
      time: dateFns.parseISO(key),
      ...values,
      location: byTimeDataPoints[0].location,
    } as FmiDataPoint
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

type WeatherSymbolNumber = keyof typeof weatherSymbols['light']

const weatherSymbols = {
  light: {
    // TODO
    1: 'humidity.svg',
    2: 'humidity.svg',
    3: 'humidity.svg',
    21: 'humidity.svg',
    22: 'humidity.svg',
    23: 'humidity.svg',
    31: 'humidity.svg',
    32: 'humidity.svg',
    33: 'humidity.svg',
    41: 'humidity.svg',
    42: 'humidity.svg',
    43: 'humidity.svg',
    51: 'humidity.svg',
    52: 'humidity.svg',
    53: 'humidity.svg',
    61: 'humidity.svg',
    62: 'humidity.svg',
    63: 'humidity.svg',
    64: 'humidity.svg',
    71: 'humidity.svg',
    72: 'humidity.svg',
    73: 'humidity.svg',
    81: 'humidity.svg',
    82: 'humidity.svg',
    83: 'humidity.svg',
    91: 'humidity.svg',
    92: 'humidity.svg',
  },
  dark: {
    1: 'humidity.svg',
    2: 'humidity.svg',
    3: 'humidity.svg',
    21: 'humidity.svg',
    22: 'humidity.svg',
    23: 'humidity.svg',
    31: 'humidity.svg',
    32: 'humidity.svg',
    33: 'humidity.svg',
    41: 'humidity.svg',
    42: 'humidity.svg',
    43: 'humidity.svg',
    51: 'humidity.svg',
    52: 'humidity.svg',
    53: 'humidity.svg',
    61: 'humidity.svg',
    62: 'humidity.svg',
    63: 'humidity.svg',
    64: 'humidity.svg',
    71: 'humidity.svg',
    72: 'humidity.svg',
    73: 'humidity.svg',
    81: 'humidity.svg',
    82: 'humidity.svg',
    83: 'humidity.svg',
    91: 'humidity.svg',
    92: 'humidity.svg',
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
