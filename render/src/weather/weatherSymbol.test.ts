import * as fs from 'fs'
import { WeatherSymbolNumber } from 'src/types'
import { getPathWithinSrc } from 'src/utils/utils'
import {
  weatherSymbolDescriptions,
  weatherSymbolIcons,
} from 'src/weather/weatherSymbol'

describe('weatherSymbol', () => {
  // Copy pasted from real code file, not using jest expects here
  test('assert all icons', () => {
    Object.keys(weatherSymbolDescriptions).forEach((symbol) => {
      if (!(symbol in weatherSymbolIcons['light'])) {
        throw new Error(`${symbol} missing from light weather icons object`)
      }
      if (!(symbol in weatherSymbolIcons['dark'])) {
        throw new Error(`${symbol} missing from dark weather icons object`)
      }
    })

    Object.keys(weatherSymbolIcons['light']).forEach((symbol: any) => {
      const icon = weatherSymbolIcons['light'][symbol as WeatherSymbolNumber]
      if (
        !fs.existsSync(
          getPathWithinSrc('templates/weather-icons', `${icon}.svg`)
        )
      ) {
        throw new Error(`${icon}.svg not found from weather-icons/ directory`)
      }
    })

    Object.keys(weatherSymbolIcons['dark']).forEach((symbol: any) => {
      const icon = weatherSymbolIcons['dark'][symbol as WeatherSymbolNumber]
      if (
        !fs.existsSync(
          getPathWithinSrc('templates/weather-icons', `${icon}.svg`)
        )
      ) {
        throw new Error(`${icon}.svg not found from weather-icons/ directory`)
      }
    })
  })
})
