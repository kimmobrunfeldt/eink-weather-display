import axios from 'axios'
import * as dateFns from 'date-fns'
import { XMLParser } from 'fast-xml-parser'
import _ from 'lodash'
import { logger } from 'src/logger'
import {
  getNextHour,
  START_FORECAST_HOUR,
  sumByOrNull,
  writeDebugFile,
} from 'src/utils'
import {
  meteoToFmiWeatherSymbolNumber,
  MeteoWeatherCode,
  weatherSymbolDescriptions,
  WeatherSymbolNumber,
} from 'src/weatherSymbol'
import { getSunrise, getSunset } from 'sunrise-sunset-js'

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

type FmiBaseDataPoint = {
  time: Date
  location: Coordinate
}

type FmiEcmwfDataPoint = FmiBaseDataPoint & {
  Temperature: number
  Humidity: number
  WindSpeedMS: number
  Pressure: number
  Precipitation1h: number
}

type FmiHarmonieDataPoint = FmiBaseDataPoint &
  FmiEcmwfDataPoint & {
    Humidity: number
    WindGust: number
    WindDirection: number
    Visibility: number
    PrecipitationAmount: number
    DewPoint: number
    WeatherSymbol3: number
  }

type MeteoAirQualityForecastResponse = {
  utc_offset_seconds: number
  hourly: {
    time: Date[]
    uv_index: number[]
  }
}

type MeteoForecastResponse = {
  utc_offset_seconds: number
  daily: {
    time: Date[]
    weathercode: MeteoWeatherCode[]
  }
}

const FMI_API_URL = 'http://opendata.fmi.fi/wfs'

export async function getLocalWeatherData({
  location,
  timezone,
}: {
  location: Coordinate
  timezone: string
}): Promise<LocalWeather> {
  const fmiHarmonieData = await fetchFmiHarmonieData(location)
  const fmiEcmwfData = await fetchFmiEcmwfData(location)
  const meteoForecastData = await fetchMeteoForecast(location, timezone)
  const meteoAirQualityForecastData = await fetchMeteoAirQualityForecast(
    location,
    timezone
  )

  const maxUv = findHighestUVIndex(meteoAirQualityForecastData)
  const todaySummary = calculateTodaySummary(fmiHarmonieData, location)
  return {
    todaySummary: { ...todaySummary, maxUvIndex: maxUv },
    forecastShortTerm: calculateShortTermForecast(fmiHarmonieData),
    forecastLongTerm: calculateLongTermForecast(fmiEcmwfData).map((data) => {
      return {
        ...data,
        symbol: findWeatherSymbolForTime(meteoForecastData, data.time),
      }
    }),
  }
}

async function fetchFmiHarmonieData(
  location: Coordinate
): Promise<FmiHarmonieDataPoint[]> {
  const res = await axios.get(FMI_API_URL, {
    params: getFmiHarmonieParameters(location),
  })
  await writeDebugFile('fmi-harmonie-response.xml', res.data)
  const data = parseWeatherTodayXmlResponse<FmiHarmonieDataPoint>(res.data)
  await writeDebugFile('fmi-harmonie-parsed-data.json', data)
  return data
}

async function fetchFmiEcmwfData(
  location: Coordinate
): Promise<FmiEcmwfDataPoint[]> {
  const res = await axios.get(FMI_API_URL, {
    params: getFmiECMWFParameters(location),
  })
  await writeDebugFile('fmi-ecmwf-response.xml', res.data)
  const data = parseWeatherTodayXmlResponse<FmiEcmwfDataPoint>(res.data)
  await writeDebugFile('fmi-ecmwf-parsed-data.json', data)
  return data
}

async function fetchMeteoForecast(
  location: Coordinate,
  timezone: string
): Promise<MeteoForecastResponse> {
  const start = dateFns.startOfDay(getNextHour(START_FORECAST_HOUR))
  const firstDay = dateFns.addDays(start, 1)
  const lastDay = dateFns.addDays(firstDay, 5)

  const res = await axios.get<MeteoForecastResponse>(
    'https://api.open-meteo.com/v1/forecast',
    {
      params: {
        latitude: location.lat,
        longitude: location.lon,
        daily: ['weathercode', 'precipitation_sum', 'sunrise', 'sunset'].join(
          ','
        ),
        timezone,
        start_date: dateFns.format(firstDay, 'yyyy-MM-dd'),
        end_date: dateFns.format(lastDay, 'yyyy-MM-dd'),
      },
    }
  )
  await writeDebugFile('meteo-response-forecast.json', res.data)

  return {
    ...res.data,
    daily: {
      ...res.data.daily,
      time: res.data.daily.time.map((t) => {
        const date = dateFns.parse(
          t as unknown as string,
          'yyyy-MM-dd',
          new Date()
        )
        return date
      }),
    },
  }
}

async function fetchMeteoAirQualityForecast(
  location: Coordinate,
  timezone: string
): Promise<MeteoAirQualityForecastResponse> {
  const start = dateFns.startOfDay(getNextHour(START_FORECAST_HOUR))
  const end = dateFns.addDays(start, 2)
  const res = await axios.get<MeteoAirQualityForecastResponse>(
    'https://air-quality-api.open-meteo.com/v1/air-quality',
    {
      params: {
        latitude: location.lat,
        longitude: location.lon,
        hourly: ['uv_index'].join(','),
        timezone,
        start_date: dateFns.format(start, 'yyyy-MM-dd'),
        end_date: dateFns.format(end, 'yyyy-MM-dd'),
      },
    }
  )
  await writeDebugFile('meteo-response-air-quality-forecast.json', res.data)
  return {
    ...res.data,
    hourly: {
      ...res.data.hourly,
      time: res.data.hourly.time.map((t) => {
        const date = dateFns.parse(
          t as unknown as string,
          "yyyy-MM-dd'T'HH:mm",
          new Date()
        )
        return date
      }),
    },
  }
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

function calculateLongTermForecast(fmiData: FmiEcmwfDataPoint[]) {
  const start = dateFns.startOfDay(getNextHour(START_FORECAST_HOUR))
  const forecastTimes = [1, 2, 3, 4, 5].map((d) => dateFns.addDays(start, d))

  return forecastTimes.map((time, index) => {
    const fmiIndex = fmiData.findIndex((d) => dateFns.isEqual(d.time, time))
    const found = fmiData[fmiIndex]
    if (!found) {
      logger.error('Time:', time)
      logger.error('FMI Data:', JSON.stringify(fmiData))
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
) {
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
    precipitationAmount,
  }
}

function findHighestUVIndex(
  forecast: MeteoAirQualityForecastResponse
): MaxUvIndex {
  const nextH = getNextHour(START_FORECAST_HOUR)
  const hoursToday = forecast.hourly.time
    .map((time, index) => ({
      time: new Date(time),
      index,
    }))
    .filter(
      ({ time }) =>
        dateFns.isAfter(time, dateFns.startOfDay(nextH)) &&
        dateFns.isBefore(time, dateFns.endOfDay(nextH))
    )

  const maxHour = _.maxBy(
    hoursToday,
    ({ index }) => forecast.hourly.uv_index[index]
  )
  if (!maxHour) {
    throw new Error('Unable to find max UV index for day')
  }
  return {
    time: maxHour.time,
    value: forecast.hourly.uv_index[maxHour.index],
  }
}

function findWeatherSymbolForTime(
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

function parseWeatherTodayXmlResponse<
  T extends FmiHarmonieDataPoint | FmiEcmwfDataPoint
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
