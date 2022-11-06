import * as dateFns from 'date-fns'
import fs from 'fs'
import _ from 'lodash'
import path from 'path'
import { GenerateOptions } from 'src/core'
import * as utils from 'src/utils'
import { calculateTodaySummary, parseFmiXmlResponse } from 'src/weather'

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, '../fixtures/', name), {
    encoding: 'utf8',
  })

const mockOpts: GenerateOptions = {
  startForecastAtHour: 9,
  timezone: 'Europe/Helsinki',
  locationName: 'Helsinki',
  batteryLevel: 100,
  location: {
    lat: 0,
    lon: 0,
  },
}

describe('calculateTodaySummary', () => {
  test('filters out data from other days', () => {
    const mockHour = {
      // 9AM Europe/Helsinki time
      hourInUtc: new Date('2022-11-02T07:00:00.000Z'),
      // Start of day in Europe/Helsinki time
      startOfLocalDayInUtc: new Date('2022-11-01T22:00:00.000Z'),
      // End of day in Europe/Helsinki time
      endOfLocalDayInUtc: new Date('2022-11-02T21:59:59.999Z'),
    }

    jest.spyOn(utils, 'getNextHourDates').mockImplementation(() => mockHour)

    const fmiData = [
      // Before day, set numbers obviously wrong
      {
        Temperature: -100000,
        Humidity: -100000,
        WindSpeedMS: -100000,
        WindGust: -100000,
        WindDirection: -100000,
        Pressure: -100000,
        Visibility: -100000,
        PrecipitationAmount: -100000,
        Precipitation1h: -100000,
        DewPoint: -100000,
        WeatherSymbol3: -100000,
        // *Just* before the day
        time: dateFns.subMilliseconds(mockHour.startOfLocalDayInUtc, 1),
        // Location doesn't matter
        location: {
          lat: 0,
          lon: 0,
        },
      },

      // Correct datapoints

      // Just at the start of day
      {
        Temperature: 9,
        Humidity: 49,
        WindSpeedMS: 5,
        WindGust: 15,
        WindDirection: 200,
        Pressure: 1000,
        Visibility: 10000,
        PrecipitationAmount: 5,
        Precipitation1h: 10,
        DewPoint: 8.5,
        WeatherSymbol3: 1,
        time: mockHour.startOfLocalDayInUtc,
        // Location doesn't matter
        location: {
          lat: 0,
          lon: 0,
        },
      },

      // Middle of day
      {
        Temperature: 10,
        Humidity: 50,
        WindSpeedMS: 5,
        WindGust: 15,
        WindDirection: 200,
        Pressure: 1000,
        Visibility: 10000,
        PrecipitationAmount: 0,
        Precipitation1h: 0,
        DewPoint: 8.5,
        WeatherSymbol3: 31,
        time: mockHour.startOfLocalDayInUtc,
        // Location doesn't matter
        location: {
          lat: 0,
          lon: 0,
        },
      },

      // Just at the end of day
      {
        Temperature: 11,
        Humidity: 51,
        WindSpeedMS: 5,
        WindGust: 15,
        WindDirection: 200,
        Pressure: 1000,
        Visibility: 10000,
        PrecipitationAmount: 5,
        Precipitation1h: 30,
        DewPoint: 8.5,
        WeatherSymbol3: 31,
        time: mockHour.endOfLocalDayInUtc,
        // Location doesn't matter
        location: {
          lat: 0,
          lon: 0,
        },
      },

      // After the day, set numbers obviously wrong
      {
        Temperature: -100000,
        Humidity: -100000,
        WindSpeedMS: -100000,
        WindGust: -100000,
        WindDirection: -100000,
        Pressure: -100000,
        Visibility: -100000,
        PrecipitationAmount: -100000,
        Precipitation1h: -100000,
        DewPoint: -100000,
        WeatherSymbol3: -100000,
        // *Just* after the day
        time: dateFns.addMilliseconds(mockHour.endOfLocalDayInUtc, 1),
        // Location doesn't matter
        location: {
          lat: 0,
          lon: 0,
        },
      },
    ]
    expect(calculateTodaySummary(fmiData, mockOpts)).toEqual(
      expect.objectContaining({
        avgTemperature: 10, // Average of 9 and 11
        avgWindSpeedMs: 5,
        description: 'Light showers',
        maxTemperature: 11,
        maxWindSpeedMs: 5,
        minTemperature: 11,
        minWindSpeedMs: 5,
        // 1h counts summed (10 + 30)
        // using 1h counts seemed more reliable from FMI
        precipitationAmount: 40,
        symbol: 31, // from 1, 31, 31 datapoints -> by max count is 31
      })
    )
  })
})

describe('parsing XML from FMI', () => {
  // Parse JSON fixture back to JS object (e.g. NaNs saved as null)
  const fromJson = (data: any) =>
    data.map((point: any) => {
      return {
        ..._.mapValues(point, (val) => (_.isNull(val) ? NaN : val)),
        time: new Date(point.time),
      }
    })

  test('parsing Harmonie model full XML from FMI API', () => {
    const xml = fixture('fmi-harmonie-full-response.xml')
    const data = JSON.parse(fixture('fmi-harmonie-full-parsed-data.json'))
    expect(parseFmiXmlResponse(xml)).toEqual(fromJson(data))
  })

  test('parsing ECMWF model full XML from FMI API', () => {
    const xml = fixture('fmi-ecmwf-full-response.xml')
    const data = JSON.parse(fixture('fmi-ecmwf-full-parsed-data.json'))
    expect(parseFmiXmlResponse(xml)).toEqual(fromJson(data))
  })

  test('groups by time and parses all fields as numbers', () => {
    const xml = fixture('fmi-response-1.xml')
    expect(parseFmiXmlResponse(xml)).toEqual([
      {
        'Anything here': 100,
        Temperature: 8,
        location: {
          lat: 60.222,
          lon: 24.83,
        },
        time: new Date('2022-11-07T07:00:00.000Z'),
      },
      {
        Another: NaN,
        location: {
          lat: 60.222,
          lon: 24.83,
        },
        not_number: NaN,
        time: new Date('2022-11-07T07:00:01.000Z'),
      },
    ])
  })
})
