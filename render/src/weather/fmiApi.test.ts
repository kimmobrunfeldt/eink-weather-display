import fs from 'fs'
import _ from 'lodash'
import path from 'path'
import { parseFmiXmlResponse } from 'src/weather/fmiApi'

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, '../../fixtures/', name), {
    encoding: 'utf8',
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
