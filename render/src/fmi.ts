import * as turf from '@turf/turf'
import axios from 'axios'
import * as dateFns from 'date-fns'
import { XMLParser } from 'fast-xml-parser'
import fs from 'fs'
import _ from 'lodash'

type Coordinate = {
  lat: number
  lon: number
}

type WeatherDataPoint = {
  time: Date
}

type LocalWeather = {
  current: WeatherDataPoint
  forecast: WeatherDataPoint[]
}

type ForecastType = 'today' | '5days'

const API_URL = 'http://opendata.fmi.fi/wfs'

function getNextHour(startHour = 9) {
  const now = new Date()
  const today = dateFns.addHours(dateFns.startOfToday(), startHour)

  if (dateFns.isBefore(now, today)) {
    return today
  }

  const tomorrow = dateFns.addHours(dateFns.startOfTomorrow(), startHour)
  return tomorrow
}

function getDateParameters(type: ForecastType): {
  startDate: Date
  endDate: Date
  timeStepMin: number
} {
  switch (type) {
    case 'today': {
      const startDate = getNextHour(9) // 09:00
      return {
        startDate,
        timeStepMin: 60,
        endDate: dateFns.addHours(startDate, 48),
      }
    }

    case '5days': {
      const startDate = dateFns.addDays(
        dateFns.addHours(dateFns.startOfTomorrow(), 12),
        3
      ) // Tomorrow 12:00
      return {
        startDate,
        timeStepMin: 60,
        endDate: dateFns.addDays(startDate, 5),
      }
    }
  }
}

function getFmiParameters(location: Coordinate, type: ForecastType) {
  const { startDate, endDate, timeStepMin } = getDateParameters(type)

  const point = turf.point([location.lon, location.lat])
  console.log(point)
  const buffered = turf.buffer(point, 10, { units: 'kilometers' })
  console.log(buffered)
  const bbox = turf.bbox(buffered)

  return {
    service: 'WFS',
    version: '2.0.0',
    request: 'getFeature',
    //storedquery_id: 'fmi::forecast::harmonie::surface::point::simple',
    storedquery_id: 'ecmwf::forecast::surface::point::simple',
    starttime: startDate.toISOString(),
    endtime: endDate.toISOString(),
    //latlon: `${location.lat},${location.lon}`,
    // place: 'Espoo',
    fmisid: 100691,
    // bbox: bbox.map((n) => n.toFixed(2)).join(','),
    // timestep: timeStepMin,
    // Comment this parameter to see unfiltered fields
    parameters: [
      'Temperature',
      'Humidity',
      'WindSpeedMS',
      'WindGust',
      'WindDirection',
      'MaximumWind',
      'Pressure',
      'Visibility',
      'PrecipitationAmount',
      'Precipitation1h',
      'DewPoint',
      'WeatherSymbol3', // https://www.ilmatieteenlaitos.fi/latauspalvelun-pikaohje
      'SmartSymbol',
    ].join(','),

    // i.e. what Google Maps uses
    // crs: 'EPSG::3857', // https://en.wikipedia.org/wiki/Web_Mercator_projection#EPSG:3785
  }
}

export async function getLocalWeatherData(
  location: Coordinate,
  type: ForecastType
) {
  const res = await axios.get(API_URL, {
    params: getFmiParameters(location, type),
  })
  console.log(res.request)
  fs.writeFileSync('res.xml', res.data, { encoding: 'utf8' })
  /*
  const result = parseWeatherTodayXmlResponse(
    fs.readFileSync(path.join(__dirname, '../res.xml'), { encoding: 'utf8' })
  )
  */

  return parseWeatherTodayXmlResponse(res.data)
}

function parseWeatherTodayXmlResponse(xmlString: string) {
  const parser = new XMLParser()
  const parsed = parser.parse(xmlString)
  const dataPoints = parseMembersFromRoot(parsed).map(parseMember)
  const byTime = _.groupBy(dataPoints, 'time')
  return Object.keys(byTime).map((key) => {
    const byTimeDataPoints = byTime[key]
    const values = byTimeDataPoints.reduce((memo, curr) => {
      return {
        ...memo,
        [curr.name]: Number(curr.value),
      }
    }, {} as Record<string, number>)

    return {
      time: key,
      ...values,
      location: byTimeDataPoints[0].location,
    }
  })
}

function parseMembersFromRoot(parsed: any): Record<string, any>[] {
  if (!('wfs:FeatureCollection' in parsed)) {
    throw new Error(`XML validation error: ['wfs:FeatureCollection'] missing`)
  }
  const collection = parsed['wfs:FeatureCollection']
  if (!('wfs:member' in collection)) {
    throw new Error(
      `XML validation error: ['wfs:FeatureCollection']['wfs:member'] missing`
    )
  }

  return collection['wfs:member']
}

function parseMember(member: Record<string, any>): {
  location: Coordinate
  time: string
  name: string
  value: string
} {
  if (!('BsWfs:BsWfsElement' in member)) {
    throw new Error(`XML validation error: ['BsWfs:BsWfsElement'] missing`)
  }

  const values = member['BsWfs:BsWfsElement']
  const [lat, lon] = values['BsWfs:Location']['gml:Point']['gml:pos'].split(' ')
  return {
    location: { lat: Number(lat), lon: Number(lon) },
    time: values['BsWfs:Time'],
    name: values['BsWfs:ParameterName'],
    value: values['BsWfs:ParameterValue'],
  }
}
