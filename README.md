# eink-weather-display

Weather display for our home.

**Goals:**

* Easily glanceable weather forecast at the heart of our home. Ideally eliminates one more reason to pick up the phone.
* Looks like a "real product". The housing should look professional.
* Fully battery-powered. We didn't want a visible cable, and drilling the cable inside wall wasn't an option.
* Always visible and doesn't light up the hallway during evening / night -> e-Ink display
* Supports custom location and timezone (some [tests](render/src/utils/utils.test.ts) too)

## Hardware

* Raspberry PI Zero W
* [PiJuice Zero](https://uk.pi-supply.com/products/pijuice-zero)
* [PiJuice 12000mAh battery](https://uk.pi-supply.com/products/pijuice-12000mah-battery). As large as possible to avoid having to charge the device often.

* [Waveshare 10.3" 1872x1404 e-Ink display with Raspberry PI HAT](https://www.waveshare.com/10.3inch-e-paper-hat.htm). Supports 16 shades of black and white.

* [GeeekPi Micro Connectors Raspberry Pi 40-pin GPIO 1 to 2 Expansion Board](https://www.amazon.de/-/en/gp/product/B08C4S8NPH/ref=ppx_yo_dt_b_asin_title_o00_s00?ie=UTF8&psc=1). To connect PiJuice and e-Ink display nicely.

* [GPIO Cable for Raspberry Pi 40 Pin](https://www.amazon.de/-/en/gp/product/B08VRJ51T4/ref=ppx_yo_dt_b_asin_title_o00_s00?ie=UTF8&psc=1). To allow a bit more flexibility inside the build.

* [Geekworm Raspberry Pi Installation Tool 132 Pcs](https://www.amazon.de/-/en/gp/product/B07MN2GY6Y/ref=ppx_yo_dt_b_asin_title_o00_s00?ie=UTF8&psc=1). For a set of spacers and screws that fit Raspberry PI projects nicely.

## Get started

Note! Since the display updates only once or twice a day, everything has been designed that in mind. The forecast always starts 9AM, and doesn't show any real observations during the day.

### Developing with placeholder data

* `npm i`
* `npm start`
* Open http://127.0.0.1:8080/ to tune visuals with placeholder values hardcoded within [src/templates/index.html](src/templates/index.html)

### Rendering real values

* Open http://127.0.0.1:8080/render.html
* `npm run render` to run the CLI tool that renders HTML to `src/templates/render.html`

### Calling cloud function

```sh
LAT="60.222"
LON="24.83"
LOCATION="Espoo"
BATTERY="100"
TIMEZONE="Europe/Helsinki"

curl -vv -o weather.png \
  -H "x-api-key: $API_KEY" \
  "https://europe-west3-weather-display-367406.cloudfunctions.net/weather-display?lat=$LAT&lon=$LON&locationName=$LOCATION&batteryLevel=$BATTERY&timezone=$TIMEZONE"
```


## How it works

The project has two separate parts: render and rasp.


### `render`

Generates HTML that will be eventually rendered as PNG. The image contains the weather forecast. `render` is exposed via Google Cloud Function. It's the perfect tool for this type of task. The endpoint is quite rarely called and latencies don't matter that much.

* Weather data is fetched from APIs by [Finnish Meteorological Institute](https://en.ilmatieteenlaitos.fi/open-data-manual-api-access-csw) and [Open Meteo](https://open-meteo.com/en/docs). FMI's API had some limitations, which were covered by additional data from Meteo. For example daily weather symbols for the next 5 days.
* HTML, CSS, and Headless Chrome are utilised to generate the PNG file. This part could be done with a lower-level approach, but using CSS for layouting is super convenient.
* The view is a purposely dumb single HTML file, which has mock data to make development easy. The mock data will be replaced with real data using DOM ids. Not having a build tool removes a lot of unnecessary complexity.
* All dates within the system are UTC, they are converted to local times on render. "Start of day" and "End of day" concepts are tricky.



### `rasp`

Runs on Raspberry Pi Zero.

All code related to the hardware that will display the weather image. This
part doesn't know anything about weather, it just downloads a PNG from given URL and renders it on e-Ink display.

* Fetch PNG from given URL, render it to e-Ink display, and go back to idle. goes back to idle.
* Consumes as little power as possible
* Microcontroller could've been enough, but I also wanted to finish the project in a lifetime.
* IT8951-ePaper code copied from https://github.com/waveshare/IT8951-ePaper/

#### Installation

https://github.com/PiSupply/PiJuice/blob/master/Software/README.md


## Notes

**Links**

* https://open-meteo.com/en/docs/air-quality-api
* https://www.ilmatieteenlaitos.fi/latauspalvelun-pikaohje
* https://www.ilmatieteenlaitos.fi/tallennetut-kyselyt
* https://www.waveshare.com/wiki/10.3inch_e-Paper_HAT
* https://github.com/waveshare/IT8951-ePaper

### All fields for `fmi::forecast::harmonie::surface::point::simple`

The model can return data up to 50h from now.

```json
{
  "Pressure": 1015.7,
  "GeopHeight": 26.3,
  "Temperature": 6.4,
  "DewPoint": 4.9,
  "Humidity": 92.8,
  "WindDirection": 127,
  "WindSpeedMS": 1.97,
  "WindUMS": -1.37,
  "WindVMS": 1.37,
  "PrecipitationAmount": 0.38,
  "TotalCloudCover": 100,
  "LowCloudCover": 100,
  "MediumCloudCover": 0,
  "HighCloudCover": 58.9,
  "RadiationGlobal": 4.4,
  "RadiationGlobalAccumulation": 682913.3,
  "RadiationNetSurfaceLWAccumulation": -1537350,
  "RadiationNetSurfaceSWAccumulation": 613723.9,
  "RadiationSWAccumulation": 14.2,
  "Visibility": 7441.7,
  "WindGust": 3.6,
  "time": "2022-11-02T07:00:00.000Z",
  "location": {
    "lat": 60.222,
    "lon": 24.83
  }
}
```

### All fields for `ecmwf::forecast::surface::point::simple`

The model can return data up to 10 days from now.

```json
{
  "GeopHeight": 37.6,
  "Temperature": 5.8,
  "Pressure": 1016,
  "Humidity": 95.7,
  "WindDirection": null,
  "WindSpeedMS": null,
  "WindUMS": -1.8,
  "WindVMS": -0.1,
  "MaximumWind": null,
  "WindGust": null,
  "DewPoint": null,
  "TotalCloudCover": null,
  "WeatherSymbol3": null,
  "LowCloudCover": null,
  "MediumCloudCover": null,
  "HighCloudCover": null,
  "Precipitation1h": 0,
  "PrecipitationAmount": null,
  "RadiationGlobalAccumulation": null,
  "RadiationLWAccumulation": null,
  "RadiationNetSurfaceLWAccumulation": null,
  "RadiationNetSurfaceSWAccumulation": null,
  "RadiationDiffuseAccumulation": null,
  "LandSeaMask": null,
  "time": "2022-11-02T07:00:00.000Z",
  "location": {
    "lat": 2764063,
    "lon": 8449330.5
  }
}
```


## Credits

* Refresh icon: Created by andriwidodo from The Noun Project
* Severi Salminen for inspiration and assets https://github.com/sevesalm/eInk-weather-display
* https://raspberrypi-guide.github.io/other/boot-automation-pijuice