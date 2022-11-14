import * as turf from '@turf/turf'
import axios from 'axios'
import * as dateFns from 'date-fns'
import { XMLParser } from 'fast-xml-parser'
import _ from 'lodash'
import { GenerateOptions } from 'src/rendering/core'
import { Coordinate } from 'src/types'
import { getNextHourDates, writeDebugFile } from 'src/utils/utils'

type FmiBaseDataPoint = {
  time: Date
  location: Coordinate
}

export type FmiEcmwfDataPoint = FmiBaseDataPoint & {
  type: 'ecmwf'
  Temperature: number
  Humidity: number
  WindSpeedMS: number
  Pressure: number
  Precipitation1h: number
}

export type FmiHarmonieDataPoint = FmiBaseDataPoint & {
  type: 'harmonie'
  Temperature: number
  WindSpeedMS: number
  Pressure: number
  Precipitation1h: number
  Humidity: number
  WindGust: number
  WindDirection: number
  Visibility: number
  PrecipitationAmount: number
  DewPoint: number
  WeatherSymbol3: number
}

export type FmiObservationDataPoint = FmiBaseDataPoint & {
  type: 'observation'
  Temperature: number
  WindSpeedMS: number
  WindDirection: number
  Precipitation1h: number
}

type InternalFmiObservationDataPoint = FmiBaseDataPoint & {
  /* Air temperature */
  TA_PT1H_AVG: number
  /* Wind speed */
  WS_PT1H_AVG: number
  /* Wind direction */
  WD_PT1H_AVG: number
  /* Precipitation amount */
  PRA_PT1H_ACC: number
}

const FMI_API_URL = 'http://opendata.fmi.fi/wfs'

export async function fetchFmiHarmonieData(
  opts: GenerateOptions
): Promise<FmiHarmonieDataPoint[]> {
  const res = await axios.get(FMI_API_URL, {
    params: getFmiHarmonieParameters(opts),
  })
  await writeDebugFile('fmi-harmonie-response.xml', res.data)
  const data = parseFmiXmlResponse<FmiHarmonieDataPoint>(res.data)
  await writeDebugFile('fmi-harmonie-parsed-data.json', data)
  return data.map((d) => ({ ...d, type: 'harmonie' }))
}

export async function fetchFmiEcmwfData(
  opts: GenerateOptions
): Promise<FmiEcmwfDataPoint[]> {
  const res = await axios.get(FMI_API_URL, {
    params: getFmiECMWFParameters(opts),
  })
  await writeDebugFile('fmi-ecmwf-response.xml', res.data)
  const data = parseFmiXmlResponse<FmiEcmwfDataPoint>(res.data)
  await writeDebugFile('fmi-ecmwf-parsed-data.json', data)
  return data.map((d) => ({ ...d, type: 'ecmwf' }))
}

export async function fetchFmiObservationData(
  opts: GenerateOptions
): Promise<FmiObservationDataPoint[]> {
  const res = await axios.get(FMI_API_URL, {
    params: getFmiObservationParameters(opts),
  })
  console.log(res)
  await writeDebugFile('fmi-observation-response.xml', res.data)
  const data = parseFmiXmlResponse<InternalFmiObservationDataPoint>(res.data)
  await writeDebugFile('fmi-observation-parsed-data.json', data)
  return data.map((d) => ({
    type: 'observation',
    time: d.time,
    location: d.location,
    Temperature: d.TA_PT1H_AVG,
    WindSpeedMS: d.WS_PT1H_AVG,
    WindDirection: d.WD_PT1H_AVG,
    Precipitation1h: d.PRA_PT1H_ACC,
  }))
}

function getFmiECMWFParameters({
  location,
  startForecastAtHour,
  timezone,
}: GenerateOptions) {
  const { startOfLocalDayInUtc } = getNextHourDates(
    startForecastAtHour,
    timezone
  )
  const startDate = dateFns.addDays(startOfLocalDayInUtc, 1)
  const endDate = dateFns.addDays(startDate, 6)
  const timeStepMin = 60 // if changing, update precipitation summing

  return {
    service: 'WFS',
    version: '2.0.0',
    request: 'getFeature',
    storedquery_id: 'ecmwf::forecast::surface::point::simple',
    starttime: startDate.toISOString(),
    endtime: endDate.toISOString(),
    latlon: `${location.lat},${location.lon}`,
    timestep: timeStepMin,
    // This model returns limited data
    parameters: [
      'Temperature',
      'WindSpeedMS',
      'Pressure',
      'Precipitation1h',
    ].join(','),
    // i.e. what Google Maps uses
    crs: 'EPSG::3857', // https://en.wikipedia.org/wiki/Web_Mercator_projection#EPSG:3785
  }
}

function getFmiHarmonieParameters({ location }: GenerateOptions) {
  const startDate = new Date()
  const endDate = dateFns.addHours(startDate, 50)
  const timeStepMin = 60 // if changing, update precipitation summing

  // By default the endpoint returns 50h forecast starting from the time of request
  return {
    service: 'WFS',
    version: '2.0.0',
    request: 'getFeature',
    storedquery_id: 'fmi::forecast::harmonie::surface::point::simple',
    starttime: startDate.toISOString(),
    endtime: endDate.toISOString(),
    latlon: `${location.lat},${location.lon}`,
    timestep: timeStepMin,
    parameters: [
      'Temperature',
      'Humidity',
      'WindSpeedMS',
      'WindGust',
      'WindDirection',
      'Pressure',
      'Visibility',
      'PrecipitationAmount',
      'Precipitation1h',
      'DewPoint',
      'WeatherSymbol3', // https://www.ilmatieteenlaitos.fi/latauspalvelun-pikaohje
    ].join(','),
    // i.e. what Google Maps uses
    crs: 'EPSG::3857', // https://en.wikipedia.org/wiki/Web_Mercator_projection#EPSG:3785
  }
}

function getFmiObservationParameters({ location }: GenerateOptions) {
  const point = turf.point([location.lon, location.lat])
  const buffered = turf.buffer(point, 5, { units: 'kilometers' })
  const bbox = turf.bbox(buffered)
  const timeStepMin = 60 // if changing, update precipitation summing

  return {
    service: 'WFS',
    version: '2.0.0',
    request: 'getFeature',
    storedquery_id: 'fmi::observations::weather::hourly::simple',
    bbox: bbox.map((n) => n.toFixed(4)).join(','), // bbox=left,bottom,right,top (for example: bbox=22,64,24,68)
    // We only want data from one observation point
    maxlocations: 1,
    // fmisid: 100691,
    timestep: timeStepMin,
    // This model returns limited data
    parameters: [
      'TA_PT1H_AVG', // Air temperature
      'WS_PT1H_AVG', // Wind speed
      'WD_PT1H_AVG', // Wind direction
      'PRA_PT1H_ACC', // Precipitation amount
    ].join(','),
    // For some reason bbox didn't work when this was defined
    // i.e. what Google Maps uses
    // crs: 'EPSG::3857', // https://en.wikipedia.org/wiki/Web_Mercator_projection#EPSG:3785
  }
}

export function parseFmiXmlResponse<
  T extends
    | FmiHarmonieDataPoint
    | FmiEcmwfDataPoint
    | InternalFmiObservationDataPoint
>(xmlString: string): Omit<T, 'type'>[] {
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
      ...values,
      time: dateFns.parseISO(key),
      location: byTimeDataPoints[0].location,
    } as T
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
