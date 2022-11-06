import * as dateFns from 'date-fns'
import { GenerateOptions } from 'src/rendering/core'
import * as utils from 'src/utils/utils'
import { FmiEcmwfDataPoint, FmiHarmonieDataPoint } from 'src/weather/fmiApi'
import {
  calculateLongTermForecast,
  calculateShortTermForecast,
  calculateTodaySummaryFromFmiData,
} from 'src/weather/weather'

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
  test('calculates data from correct data points', () => {
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
        WindSpeedMS: 4,
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
        WindSpeedMS: 6,
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
    expect(calculateTodaySummaryFromFmiData(fmiData, mockOpts)).toEqual(
      expect.objectContaining({
        avgTemperature: 10, // Average of 9, 11, and 10
        minTemperature: 9,
        maxTemperature: 11,
        avgWindSpeedMs: 5, // avg of 4, 6, and 5
        minWindSpeedMs: 4,
        maxWindSpeedMs: 6,
        description: 'Light showers',
        // 1h counts summed (10 + 30)
        // using 1h counts seemed more reliable from FMI
        precipitationAmount: 40,
        symbol: 31, // from 1, 31, 31 datapoints -> by max count is 31
      })
    )
  })
})

describe('calculateShortTermForecast', () => {
  test('calculates data from correct data points', () => {
    const mockHour = {
      // 9AM Europe/Helsinki time
      hourInUtc: new Date('2022-11-02T07:00:00.000Z'),
      // Start of day in Europe/Helsinki time
      startOfLocalDayInUtc: new Date('2022-11-01T22:00:00.000Z'),
      // End of day in Europe/Helsinki time
      endOfLocalDayInUtc: new Date('2022-11-02T21:59:59.999Z'),
    }

    jest.spyOn(utils, 'getNextHourDates').mockImplementation(() => mockHour)

    const fmiData: FmiHarmonieDataPoint[] = [
      // Before the time
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
        // *Just* before the hour
        time: dateFns.subMilliseconds(mockHour.hourInUtc, 1),
        // Location doesn't matter
        location: {
          lat: 0,
          lon: 0,
        },
      },

      // Correct datapoints

      // 1st requested forecast time point
      {
        Temperature: 9,
        Humidity: 49,
        WindSpeedMS: 5,
        WindGust: 15,
        WindDirection: 200,
        Pressure: 1000,
        Visibility: 10000,
        PrecipitationAmount: -1000, // not used
        Precipitation1h: 7,
        DewPoint: 8.5,
        WeatherSymbol3: 1,
        time: mockHour.hourInUtc,
        // Location doesn't matter
        location: {
          lat: 0,
          lon: 0,
        },
      },

      // Data point between 1st and 2nd forecast time
      {
        Temperature: 9,
        Humidity: 49,
        WindSpeedMS: 5,
        WindGust: 15,
        WindDirection: 200,
        Pressure: 1100,
        Visibility: 10000,
        PrecipitationAmount: -1000, // not used
        Precipitation1h: 9,
        DewPoint: 8.5,
        WeatherSymbol3: 31, // this is not taken into account in the result
        time: dateFns.addHours(mockHour.hourInUtc, 1),
        // Location doesn't matter
        location: {
          lat: 0,
          lon: 0,
        },
      },

      // 2nd requested forecast time point
      {
        Temperature: 15,
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
        time: dateFns.addHours(mockHour.hourInUtc, 2),
        // Location doesn't matter
        location: {
          lat: 0,
          lon: 0,
        },
      },

      // Data point between 2nd and 3rd forecast time point
      {
        Temperature: 10,
        Humidity: 49,
        WindSpeedMS: 10,
        WindGust: 25,
        WindDirection: 200,
        Pressure: 1000,
        Visibility: 10000,
        PrecipitationAmount: 5,
        Precipitation1h: 11,
        DewPoint: 8.5,
        WeatherSymbol3: 1,
        time: dateFns.addHours(mockHour.hourInUtc, 3),
        // Location doesn't matter
        location: {
          lat: 0,
          lon: 0,
        },
      },

      // After hour, set numbers obviously wrong
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
        // *Just* after the requested timeframe (end is exclusive)
        time: dateFns.addHours(mockHour.hourInUtc, 4),
        // Location doesn't matter
        location: {
          lat: 0,
          lon: 0,
        },
      },
    ]
    const forecastTimes = [0, 2, 4].map((h) =>
      dateFns.addHours(mockHour.hourInUtc, h)
    )
    expect(
      calculateShortTermForecast(fmiData, mockOpts, forecastTimes)
    ).toEqual([
      // Forecast for 09-10AM
      {
        dewPoint: 8.5,
        precipitation1h: 7, // takes the first hour's data
        precipitationAmountFromNowToNext: 16, // sum of 7 + 9
        pressure: 1050, // avg of 1000 and 1100
        symbol: 1,
        temperature: 9,
        time: new Date('2022-11-02T07:00:00.000Z'),
        windGustMs: 15,
        windSpeedMs: 5,
      },
      // Forecast for 10-11AM
      {
        dewPoint: 8.5,
        precipitation1h: 10,
        precipitationAmountFromNowToNext: 21,
        pressure: 1000,
        symbol: 1,
        temperature: 12.5, // avg of 10 and 15
        time: new Date('2022-11-02T09:00:00.000Z'),
        windGustMs: 20, // avg of 15 and 25
        windSpeedMs: 7.5, // avg of 5 and 10
      },
    ])
  })
})

describe('calculateLongTermForecast', () => {
  test('calculates data from correct data points', () => {
    const mockHour = {
      // 9AM Europe/Helsinki time
      hourInUtc: new Date('2022-11-02T07:00:00.000Z'),
      // Start of day in Europe/Helsinki time
      startOfLocalDayInUtc: new Date('2022-11-01T22:00:00.000Z'),
      // End of day in Europe/Helsinki time
      endOfLocalDayInUtc: new Date('2022-11-02T21:59:59.999Z'),
    }

    jest.spyOn(utils, 'getNextHourDates').mockImplementation(() => mockHour)

    const fmiData: FmiEcmwfDataPoint[] = [
      // Just before the next day starts
      {
        Temperature: -100000,
        Humidity: -100000,
        WindSpeedMS: -100000,
        Pressure: -100000,
        Precipitation1h: -100000,
        time: mockHour.endOfLocalDayInUtc,
        // Location doesn't matter
        location: {
          lat: 0,
          lon: 0,
        },
      },

      // Correct datapoints

      // 1st requested forecast day
      {
        Temperature: 10,
        Humidity: 49,
        WindSpeedMS: 5,
        Pressure: 1000,
        Precipitation1h: 7,
        time: dateFns.addDays(mockHour.startOfLocalDayInUtc, 1),
        // Location doesn't matter
        location: {
          lat: 0,
          lon: 0,
        },
      },
      {
        Temperature: 15,
        Humidity: 49,
        WindSpeedMS: 15,
        Pressure: 1000,
        Precipitation1h: 10,
        // *Just* at the end of 1st requested day
        time: dateFns.subMilliseconds(
          dateFns.addDays(mockHour.startOfLocalDayInUtc, 2),
          1
        ),
        // Location doesn't matter
        location: {
          lat: 0,
          lon: 0,
        },
      },

      // 2nd requested forecast day
      {
        Temperature: 10,
        Humidity: 49,
        WindSpeedMS: 5,
        Pressure: 1000,
        Precipitation1h: 10,
        time: dateFns.addDays(mockHour.startOfLocalDayInUtc, 2),
        // Location doesn't matter
        location: {
          lat: 0,
          lon: 0,
        },
      },
      {
        Temperature: 20,
        Humidity: 51,
        WindSpeedMS: 15,
        Pressure: 1000,
        Precipitation1h: 30,
        // *Just* at the end of 2st requested day
        time: dateFns.subMilliseconds(
          dateFns.addDays(mockHour.startOfLocalDayInUtc, 3),
          1
        ),
        // Location doesn't matter
        location: {
          lat: 0,
          lon: 0,
        },
      },

      // Just after the requested range
      {
        Temperature: 9,
        Humidity: 49,
        WindSpeedMS: 5,
        Pressure: 1000,
        Precipitation1h: 7,
        time: dateFns.addDays(mockHour.startOfLocalDayInUtc, 3), // end is exclusive
        // Location doesn't matter
        location: {
          lat: 0,
          lon: 0,
        },
      },
    ]
    // Request forecast data for 1st and 2nd day after the starting hour
    const forecastTimes = [1, 2, 3].map((d) =>
      dateFns.addDays(mockHour.startOfLocalDayInUtc, d)
    )
    expect(calculateLongTermForecast(fmiData, mockOpts, forecastTimes)).toEqual(
      [
        // Forecast for 1st day
        {
          avgTemperature: 12.5, // avg of 10 and 15
          minTemperature: 10,
          maxTemperature: 15,
          avgWindSpeedMs: 10, // avg of 5 and 15
          minWindSpeedMs: 5,
          maxWindSpeedMs: 15,
          precipitationAmountFromNowToNext: 17, // sum of 7 + 10
          time: new Date('2022-11-02T22:00:00.000Z'),
        },

        // Forecast for 2nd day
        {
          avgTemperature: 15, // avg of 10 and 20
          minTemperature: 10,
          maxTemperature: 20,
          avgWindSpeedMs: 10, // avg of 5 and 15
          minWindSpeedMs: 5,
          maxWindSpeedMs: 15,
          precipitationAmountFromNowToNext: 40, // sum of 10 + 30
          time: new Date('2022-11-03T22:00:00.000Z'),
        },
      ]
    )
  })
})
