import axios from 'axios'
import * as dateFns from 'date-fns'
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz'
import { GenerateOptions } from 'src/rendering/core'
import { MeteoWeatherCode } from 'src/types'
import { logger } from 'src/utils/logger'
import { getTodayDates, writeDebugFile } from 'src/utils/utils'

export type MeteoLongTermForecastResponse = {
  utc_offset_seconds: number
  daily: {
    time: Date[]
    weathercode: MeteoWeatherCode[]
  }
}

export type MeteoShortTermForecastResponse = {
  utc_offset_seconds: number
  hourly: {
    time: Date[]
    weathercode: MeteoWeatherCode[]
  }
}

export type MeteoAirQualityForecastResponse = {
  utc_offset_seconds: number
  hourly: {
    time: Date[]
    uv_index: number[]
  }
}

export async function fetchMeteoForecastLongTerm({
  location,
  switchDayAtHour,
  timezone,
}: GenerateOptions): Promise<MeteoLongTermForecastResponse> {
  const { startOfLocalDayInUtc } = getTodayDates(switchDayAtHour, timezone)
  const start = utcToZonedTime(startOfLocalDayInUtc, timezone)
  const firstDay = dateFns.addDays(start, 1)
  const lastDay = dateFns.addDays(firstDay, 5)

  const res = await axios.get<MeteoLongTermForecastResponse>(
    'https://api.open-meteo.com/v1/forecast',
    {
      params: {
        latitude: location.lat,
        longitude: location.lon,
        daily: ['weathercode', 'precipitation_sum', 'sunrise', 'sunset'].join(
          ','
        ),
        timezone: 'UTC',
        start_date: dateFns.format(firstDay, 'yyyy-MM-dd'),
        end_date: dateFns.format(lastDay, 'yyyy-MM-dd'),
      },
    }
  )
  await writeDebugFile('meteo-response-long-forecast.json', res.data)

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
        // Parsing returns e.g. 2022-11-04T00:00:00.000Z
        // Convert it to the real start of day according to given timezone
        return zonedTimeToUtc(date, timezone)
      }),
    },
  }
}

export async function fetchMeteoForecastShortTerm({
  location,
  switchDayAtHour,
  timezone,
}: GenerateOptions): Promise<MeteoShortTermForecastResponse> {
  const { startOfLocalDayInUtc } = getTodayDates(switchDayAtHour, timezone)
  const start = utcToZonedTime(startOfLocalDayInUtc, timezone)

  const res = await axios.get<MeteoShortTermForecastResponse>(
    'https://api.open-meteo.com/v1/forecast',
    {
      params: {
        latitude: location.lat,
        longitude: location.lon,
        hourly: ['weathercode'].join(','),
        timezone: 'UTC',
        start_date: dateFns.format(start, 'yyyy-MM-dd'),
        end_date: dateFns.format(start, 'yyyy-MM-dd'),
      },
    }
  )
  logger.info(
    `fetchMeteoForecastShortTerm request ${res.request.protocol}//${res.request.host}${res.request.path}`
  )
  await writeDebugFile('meteo-response-short-forecast.json', res.data)

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
        // Parsing returns e.g. 2022-11-04T00:00:00.000Z
        // Convert it to the real start of day according to given timezone
        return zonedTimeToUtc(date, timezone)
      }),
    },
  }
}

export async function fetchMeteoAirQualityForecastToday({
  location,
  switchDayAtHour: startForecastAtHour,
  timezone,
}: GenerateOptions): Promise<MeteoAirQualityForecastResponse> {
  const { startOfLocalDayInUtc } = getTodayDates(startForecastAtHour, timezone)
  const start = utcToZonedTime(startOfLocalDayInUtc, timezone)
  const end = dateFns.addDays(start, 2)
  const res = await axios.get<MeteoAirQualityForecastResponse>(
    'https://air-quality-api.open-meteo.com/v1/air-quality',
    {
      params: {
        latitude: location.lat,
        longitude: location.lon,
        hourly: ['uv_index'].join(','),
        timezone: 'UTC',
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
        // Parsing returns e.g. 2022-11-04T00:00:00.000Z
        // Convert it to the real start of day according to given timezone
        return zonedTimeToUtc(date, timezone)
      }),
    },
  }
}

type MeteoAttributes = {
  time: Date[]
  [key: string]: any[]
}
export function attrsByTime<T extends MeteoAttributes>(
  attrs: T
): Array<{ [K in keyof T]: T[K][number] }> {
  const { time: timeArray, ...otherAttrs } = attrs
  return timeArray.map((time, index) => {
    const keys = Object.keys(otherAttrs)
    const others = keys.reduce(
      (memo, key) => ({ ...memo, [key]: otherAttrs[key][index] }),
      {}
    )
    return {
      time,
      ...others,
    } as any
  })
}
