import * as turf from '@turf/turf'

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

export function getLocalWeather(location: Coordinate): LocalWeather {
  const point = turf.point([location.lon, location.lat])
  console.log(point)
  const buffered = turf.buffer(point, 10, { units: 'kilometers' })
  console.log(buffered)
  const bbox = turf.bbox(buffered)

  return {
    current: {
      time: new Date(),
    },
    forecast: [],
  }
}
