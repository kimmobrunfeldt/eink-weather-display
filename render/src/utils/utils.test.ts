import * as utils from 'src/utils/utils'

describe('getTodayDates', () => {
  test('8:59AM Europe/Helsinki (winter time, UTC+2)', () => {
    jest.setSystemTime(new Date('2022-11-02T06:59:00Z'))

    expect(utils.getTodayDates(9, 'Europe/Helsinki')).toEqual({
      // Start of day in Europe/Helsinki time
      startOfLocalDayInUtc: new Date('2022-11-01T22:00:00.000Z'),
      // End of day in Europe/Helsinki time
      endOfLocalDayInUtc: new Date('2022-11-02T21:59:59.999Z'),
    })
  })

  test('exactly 9AM Europe/Helsinki (winter time, UTC+2)', () => {
    jest.setSystemTime(new Date('2022-11-02T07:00:00Z'))

    expect(utils.getTodayDates(9, 'Europe/Helsinki')).toEqual({
      // This is exactly the switch day hour to prepare for an edge case
      startOfLocalDayInUtc: new Date('2022-11-02T22:00:00.000Z'),
      endOfLocalDayInUtc: new Date('2022-11-03T21:59:59.999Z'),
    })
  })

  test('8:59AM Europe/Helsinki (summer time, UTC+3)', () => {
    jest.setSystemTime(new Date('2022-10-02T05:59:00Z')) // 8:59 AM at summer time

    expect(utils.getTodayDates(9, 'Europe/Helsinki')).toEqual({
      startOfLocalDayInUtc: new Date('2022-10-01T21:00:00.000Z'),
      endOfLocalDayInUtc: new Date('2022-10-02T20:59:59.999Z'),
    })
  })

  test('8:59AM Europe/Stockholm, (winter time, UTC+1)', () => {
    jest.setSystemTime(new Date('2022-11-02T07:59:00Z')) // 8:59 AM

    expect(utils.getTodayDates(9, 'Europe/Stockholm')).toEqual({
      startOfLocalDayInUtc: new Date('2022-11-01T23:00:00.000Z'),
      endOfLocalDayInUtc: new Date('2022-11-02T22:59:59.999Z'),
    })
  })
})
