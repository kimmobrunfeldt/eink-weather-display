import axios from 'axios'
import * as dateFns from 'date-fns'
import { zonedTimeToUtc } from 'date-fns-tz'
import { GenerateOptions } from 'src/rendering/core'
import { MeteoWeatherCode } from 'src/types'
import { getNextHourDates, writeDebugFile } from 'src/utils/utils'

export type MeteoForecastResponse = {
  utc_offset_seconds: number
  daily: {
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

export async function fetchMeteoForecast({
  location,
  startForecastAtHour,
  timezone,
}: GenerateOptions): Promise<MeteoForecastResponse> {
  const { startOfLocalDayInUtc: start } = getNextHourDates(
    startForecastAtHour,
    timezone
  )
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
        timezone: 'UTC',
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
        // Parsing returns e.g. 2022-11-04T00:00:00.000Z
        // Convert it to the real start of day according to given timezone
        return zonedTimeToUtc(date, timezone)
      }),
    },
  }
}

export async function fetchMeteoAirQualityForecast({
  location,
  startForecastAtHour,
  timezone,
}: GenerateOptions): Promise<MeteoAirQualityForecastResponse> {
  const { startOfLocalDayInUtc: start } = getNextHourDates(
    startForecastAtHour,
    timezone
  )
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
