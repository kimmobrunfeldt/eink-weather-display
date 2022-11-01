import * as dateFns from 'date-fns'
import * as fs from 'fs'
import _ from 'lodash'
import * as path from 'path'
import { Coordinate } from 'src/weather'
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

export function formatWindSpeed(n: number): string {
  const str = n.toFixed(1)
  if (str.endsWith('.0')) {
    return String(Math.round(n))
  }

  return str
}

export function getBatteryIcon(level: number): string {
  const closest = _.minBy([0, 25, 50, 75, 100], (n) => Math.abs(n - level))
  return `battery_${closest}.svg`
}

export function writeDebugFileSync(name: string, data: any) {
  const date = dateFns.format(new Date(), 'yyyy-MM-dd')
  const filePath = path.join(__dirname, '../../logs/', `${date}-${name}`)
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

export const START_FORECAST_HOUR = 9
export function getNextHour(startHour: number) {
  const now = new Date()
  const today = dateFns.addHours(dateFns.startOfToday(), startHour)

  if (dateFns.isBefore(now, today)) {
    return today
  }

  const tomorrow = dateFns.addHours(dateFns.startOfTomorrow(), startHour)
  return tomorrow
}
