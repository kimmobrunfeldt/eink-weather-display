import { Storage } from '@google-cloud/storage'
import * as dateFns from 'date-fns'
import { zonedTimeToUtc } from 'date-fns-tz'
import * as fs from 'fs'
import _ from 'lodash'
import * as path from 'path'
import { environment } from 'src/environment'
import { Coordinate } from 'src/types'
import { getSunrise, getSunset } from 'sunrise-sunset-js'

export const secondsToHoursAndMinutes = (s: number) => {
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return {
    h,
    m,
  }
}

export function isDark(location: Coordinate, time: Date) {
  const sunrise = getSunrise(location.lat, location.lon, time)
  const sunset = getSunset(location.lat, location.lon, time)
  return dateFns.isBefore(time, sunrise) || dateFns.isAfter(time, sunset)
}

export function formatAccurateNumber(n: number): string {
  const str = n.toFixed(1)
  if (str.endsWith('.0')) {
    return String(Math.round(n))
  }

  return str
}

export function formatAccurateNumberWhenLow(n: number): string {
  const str = n.toFixed(1)
  if (str.endsWith('.0') || n >= 1) {
    return String(Math.round(n))
  }

  return str
}

export function getBatteryIcon(level: number, charging?: boolean): string {
  if (charging) {
    return 'battery_charging.svg'
  }
  const closest = _.minBy([0, 25, 50, 75, 100], (n) => Math.abs(n - level))
  return `battery_${closest}.svg`
}

export async function writeDebugFile(name: string, data: any) {
  const date = dateFns.format(new Date(), 'yyyy-MM-dd')
  const dateTime = dateFns.format(new Date(), 'yyyy-MM-dd_HHmmss')
  const fileName = `${dateTime}-${name}`

  if (environment.NODE_ENV === 'development') {
    return writeLocalDebugFile(fileName, data)
  } else {
    return await saveDebugFileToBucket(`${date}/${fileName}`, data)
  }
}

export async function saveDebugFileToBucket(name: string, data: any) {
  const { encoding, content } = getFileContent(data)
  const storage = new Storage()
  const bucket = storage.bucket(environment.GCP_BUCKET)
  const file = bucket.file(name)
  await file.save(content, {
    metadata: {
      contentType: encoding,
    },
  })
}

export function writeLocalDebugFile(name: string, data: any) {
  const filePath = getPathWithinSrc('../../output/', name)
  const { encoding, content } = getFileContent(data)
  fs.writeFileSync(filePath, content, {
    encoding,
  })
}

export function getFileContent(data: any): {
  content: any
  encoding: BufferEncoding
} {
  if (_.isString(data)) {
    return {
      content: data,
      encoding: 'utf8',
    }
  } else if (_.isBuffer(data)) {
    return {
      content: data,
      encoding: 'binary',
    }
  }

  return {
    content: JSON.stringify(data, null, 2),
    encoding: 'utf8',
  }
}

export function formatNumber(
  val: number | null,
  fn: (val: number) => any
): string {
  if (_.isNull(val)) {
    return '-'
  }

  return `${fn(val)}`
}

export function getPathWithinSrc(...components: string[]): string {
  // Note! This should work for TS code and built code under dist/
  return path.join(__dirname, '../', ...components)
}

export function sumByOrNull<T>(
  arr: T[],
  fn: (item: T) => number
): number | null {
  const sum = _.sumBy(arr, fn)
  if (!_.isFinite(sum)) {
    return null
  }

  return sum
}

export function getTodayDates(daySwitchHour: number, timezone: string) {
  const startOfLocalTodayInUtc = zonedTimeToUtc(
    dateFns.startOfToday(),
    timezone
  )

  const nowUtc = new Date()
  const hAfterToShowNextDay = dateFns.addHours(
    startOfLocalTodayInUtc,
    daySwitchHour
  )
  if (dateFns.isBefore(nowUtc, hAfterToShowNextDay)) {
    return {
      startOfLocalDayInUtc: startOfLocalTodayInUtc,
      endOfLocalDayInUtc: zonedTimeToUtc(dateFns.endOfToday(), timezone),
    }
  }

  const startOfLocalTomorrowInUtc = zonedTimeToUtc(
    dateFns.startOfTomorrow(),
    timezone
  )
  return {
    startOfLocalDayInUtc: startOfLocalTomorrowInUtc,
    endOfLocalDayInUtc: zonedTimeToUtc(dateFns.endOfTomorrow(), timezone),
  }
}

const MIN_PRECIPITATION_BAR_HEIGHT = 8
export function precipitationToBarHeight(precipitation: number): number {
  if (precipitation < 0.01) {
    return 0
  }

  if (precipitation < 1) {
    return MIN_PRECIPITATION_BAR_HEIGHT
  }

  return scaleTo(precipitation, 1, 10, MIN_PRECIPITATION_BAR_HEIGHT, 100)
}

const linearEasing = (val: number): number => val

export function scaleTo(
  val: number,
  oldMin: number,
  oldMax: number,
  newMin: number,
  newMax: number,
  easing = linearEasing
) {
  // 0.0 - 1.0 in the old range
  const oldRatio = (val - oldMin) / (oldMax - oldMin)

  // Normalize in case value was out of range bounds
  const cappedOldRatio = Math.max(Math.min(oldRatio, 1), 0)
  const easedRatio = easing(cappedOldRatio)

  const newVal = easedRatio * (newMax - newMin) + newMin
  return newVal
}
