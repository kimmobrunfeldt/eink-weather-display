import * as utils from 'src/utils/utils'

describe('getNextHourDates', () => {
  test('8:59AM Europe/Helsinki (winter time, UTC+2)', () => {
    jest.setSystemTime(new Date('2022-11-02T06:59:00Z'))

    expect(utils.getNextHourDates(9, 'Europe/Helsinki')).toEqual({
      // 9AM Europe/Helsinki time.
      hourInUtc: new Date('2022-11-02T07:00:00.000Z'),
      // Start of day in Europe/Helsinki time
      startOfLocalDayInUtc: new Date('2022-11-01T22:00:00.000Z'),
      // End of day in Europe/Helsinki time
      endOfLocalDayInUtc: new Date('2022-11-02T21:59:59.999Z'),
    })
  })

  test('exactly 9AM Europe/Helsinki (winter time, UTC+2)', () => {
    jest.setSystemTime(new Date('2022-11-02T07:00:00Z'))

    expect(utils.getNextHourDates(9, 'Europe/Helsinki')).toEqual({
      // This is on the *next* day to prepare for an edge case:
      // if we'd request forecast from FMI API to current time / just in past -> not sure what happens
      hourInUtc: new Date('2022-11-03T07:00:00.000Z'),
      startOfLocalDayInUtc: new Date('2022-11-02T22:00:00.000Z'),
      endOfLocalDayInUtc: new Date('2022-11-03T21:59:59.999Z'),
    })
  })

  test('8:59AM Europe/Helsinki (summer time, UTC+3)', () => {
    jest.setSystemTime(new Date('2022-10-02T05:59:00Z')) // 8:59 AM at summer time

    expect(utils.getNextHourDates(9, 'Europe/Helsinki')).toEqual({
      hourInUtc: new Date('2022-10-02T06:00:00.000Z'),
      startOfLocalDayInUtc: new Date('2022-10-01T21:00:00.000Z'),
      endOfLocalDayInUtc: new Date('2022-10-02T20:59:59.999Z'),
    })
  })

  test('8:59AM Europe/Stockholm, (winter time, UTC+1)', () => {
    jest.setSystemTime(new Date('2022-11-02T07:59:00Z')) // 8:59 AM

    expect(utils.getNextHourDates(9, 'Europe/Stockholm')).toEqual({
      hourInUtc: new Date('2022-11-02T08:00:00.000Z'),
      startOfLocalDayInUtc: new Date('2022-11-01T23:00:00.000Z'),
      endOfLocalDayInUtc: new Date('2022-11-02T22:59:59.999Z'),
    })
  })
})
