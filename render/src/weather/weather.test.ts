import * as dateFns from 'date-fns'
import _ from 'lodash'
import { GenerateOptions } from 'src/rendering/core'
import * as utils from 'src/utils/utils'
import {
  FmiEcmwfDataPoint,
  FmiHarmonieDataPoint,
  FmiObservationDataPoint,
} from 'src/weather/fmiApi'
import { MeteoShortTermForecastResponse } from 'src/weather/meteoApi'
import {
  calculateLongTermForecast,
  calculateShortTermForecast,
  calculateTodaySummaryFromFmiData,
} from 'src/weather/weather'

const mockOpts: GenerateOptions = {
  switchDayAtHour: 18,
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
    const mockTodayDates = {
      // Start of day in Europe/Helsinki time
      startOfLocalDayInUtc: new Date('2022-11-01T22:00:00.000Z'),
      // End of day in Europe/Helsinki time
      endOfLocalDayInUtc: new Date('2022-11-02T21:59:59.999Z'),
    }

    jest.spyOn(utils, 'getTodayDates').mockImplementation(() => mockTodayDates)

    const observations: FmiObservationDataPoint[] = [
      // Just at the start of day
      {
        type: 'observation',
        Temperature: 2,
        WindSpeedMS: 4,
        WindDirection: 200,
        Precipitation1h: 10,
        time: mockTodayDates.startOfLocalDayInUtc,
        // Location doesn't matter
        location: {
          lat: 0,
          lon: 0,
        },
      },
    ]

    const forecastData: FmiHarmonieDataPoint[] = [
      // Before day, set numbers obviously wrong
      {
        type: 'harmonie',
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
        time: dateFns.subMilliseconds(mockTodayDates.startOfLocalDayInUtc, 1),
        // Location doesn't matter
        location: {
          lat: 0,
          lon: 0,
        },
      },

      // Correct datapoints

      // Just at the start of day
      {
        type: 'harmonie',
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
        time: mockTodayDates.startOfLocalDayInUtc,
        // Location doesn't matter
        location: {
          lat: 0,
          lon: 0,
        },
      },

      // Middle of day
      {
        type: 'harmonie',
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
        time: mockTodayDates.startOfLocalDayInUtc,
        // Location doesn't matter
        location: {
          lat: 0,
          lon: 0,
        },
      },

      // Just at the end of day
      {
        type: 'harmonie',
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
        time: mockTodayDates.endOfLocalDayInUtc,
        // Location doesn't matter
        location: {
          lat: 0,
          lon: 0,
        },
      },

      // After the day, set numbers obviously wrong
      {
        type: 'harmonie',
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
        time: dateFns.addMilliseconds(mockTodayDates.endOfLocalDayInUtc, 1),
        // Location doesn't matter
        location: {
          lat: 0,
          lon: 0,
        },
      },
    ]
    expect(
      calculateTodaySummaryFromFmiData(forecastData, observations, mockOpts)
    ).toEqual(
      expect.objectContaining({
        // Observations and forecasts
        all: {
          minTemperature: 2,
          maxTemperature: 11,
        },
        forecast: {
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
        },
      })
    )
  })
})

describe('calculateShortTermForecast', () => {
  test('calculates data from correct data points', () => {
    const mockTodayDates = {
      // Start of day in Europe/Helsinki time
      startOfLocalDayInUtc: new Date('2022-11-01T22:00:00.000Z'),
      // End of day in Europe/Helsinki time
      endOfLocalDayInUtc: new Date('2022-11-02T21:59:59.999Z'),
    }

    jest.spyOn(utils, 'getTodayDates').mockImplementation(() => mockTodayDates)

    const observations: FmiObservationDataPoint[] = [
      // Before the time
      {
        type: 'observation',
        Temperature: 11,
        WindSpeedMS: 15,
        WindDirection: 10,
        Precipitation1h: 10,
        // *Just* before the hour
        time: dateFns.subMilliseconds(
          dateFns.addHours(mockTodayDates.startOfLocalDayInUtc, 8),
          1
        ),
        // Location doesn't matter
        location: {
          lat: 0,
          lon: 0,
        },
      },

      {
        type: 'observation',
        Temperature: 11,
        WindSpeedMS: 15,
        WindDirection: 10,
        Precipitation1h: 10,
        time: dateFns.addHours(mockTodayDates.startOfLocalDayInUtc, 8),
        // Location doesn't matter
        location: {
          lat: 0,
          lon: 0,
        },
      },
    ]

    const meteoForecast: MeteoShortTermForecastResponse = {
      utc_offset_seconds: 0,
      hourly: {
        time: _.range(0, 24).map((h) =>
          dateFns.addHours(mockTodayDates.startOfLocalDayInUtc, h)
        ),
        // The weathercode should be taken from here for the observation data point
        weathercode: [
          99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
          99, 99, 99, 99, 99, 99, 99,
        ],
      },
    }

    const fmiData: FmiHarmonieDataPoint[] = [
      // Before the time
      {
        type: 'harmonie',
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
        time: dateFns.subMilliseconds(
          dateFns.addHours(mockTodayDates.startOfLocalDayInUtc, 8),
          1
        ),
        // Location doesn't matter
        location: {
          lat: 0,
          lon: 0,
        },
      },

      // Correct datapoints

      // 1st requested forecast time point, howerver the observation data point should be preferred over this
      {
        type: 'harmonie',
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
        time: dateFns.addHours(mockTodayDates.startOfLocalDayInUtc, 9),
        // Location doesn't matter
        location: {
          lat: 0,
          lon: 0,
        },
      },

      // Data point between 1st and 2nd forecast time
      {
        type: 'harmonie',
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
        time: dateFns.addHours(mockTodayDates.startOfLocalDayInUtc, 10),
        // Location doesn't matter
        location: {
          lat: 0,
          lon: 0,
        },
      },

      // 2nd requested forecast time point
      {
        type: 'harmonie',
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
        time: dateFns.addHours(mockTodayDates.startOfLocalDayInUtc, 11),
        // Location doesn't matter
        location: {
          lat: 0,
          lon: 0,
        },
      },

      // Data point between 2nd and 3rd forecast time point
      {
        type: 'harmonie',
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
        time: dateFns.addHours(mockTodayDates.startOfLocalDayInUtc, 12),
        // Location doesn't matter
        location: {
          lat: 0,
          lon: 0,
        },
      },

      // After hour, set numbers obviously wrong
      {
        type: 'harmonie',
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
        time: dateFns.addHours(mockTodayDates.startOfLocalDayInUtc, 13),
        // Location doesn't matter
        location: {
          lat: 0,
          lon: 0,
        },
      },
    ]
    const forecastTimes = [8, 9, 11, 13].map((h) =>
      dateFns.addHours(mockTodayDates.startOfLocalDayInUtc, h)
    )
    expect(
      calculateShortTermForecast(
        fmiData,
        meteoForecast,
        observations,
        mockOpts,
        forecastTimes
      )
    ).toEqual([
      {
        type: 'observation',
        precipitation1h: 10,
        precipitationAmountFromNowToNext: 10,
        symbol: 63, // 99 code from meteo api -> 63
        temperature: 11,
        time: new Date('2022-11-02T06:00:00.000Z'),
        windSpeedMs: 15,
      },
      // Forecast for 09-10AM
      {
        type: 'forecast',
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
        type: 'forecast',
        dewPoint: 8.5,
        precipitation1h: 10,
        precipitationAmountFromNowToNext: 21,
        pressure: 1000,
        symbol: 1,
        temperature: 15, // takes the temperature of the exact forecast time (15)
        time: new Date('2022-11-02T09:00:00.000Z'),
        windGustMs: 25, // takes the max gust speed of forecast points (15 and 25)
        windSpeedMs: 5, // takes the wind speed of the exact forecast time (5)
      },
    ])
  })
})

describe('calculateLongTermForecast', () => {
  test('calculates data from correct data points', () => {
    const mockHour = {
      // Start of day in Europe/Helsinki time
      startOfLocalDayInUtc: new Date('2022-11-01T22:00:00.000Z'),
      // End of day in Europe/Helsinki time
      endOfLocalDayInUtc: new Date('2022-11-02T21:59:59.999Z'),
    }

    jest.spyOn(utils, 'getTodayDates').mockImplementation(() => mockHour)

    const fmiData: FmiEcmwfDataPoint[] = [
      // Just before the next day starts
      {
        type: 'ecmwf',
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
        type: 'ecmwf',
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
        type: 'ecmwf',
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
        type: 'ecmwf',
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
        type: 'ecmwf',
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
        type: 'ecmwf',
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
