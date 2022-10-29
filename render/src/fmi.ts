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
  const bbox = turf.bbox(turf.buffer(point, 10, 'kilometers'))
  return {
    current: {
      time: new Date(),
    },
    forecast: [],
  }
}
