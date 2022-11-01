# weather-display

Weather display for our home.


## Get started

* `npm i`
* `npm start`
* Open http://127.0.0.1:8080/




## How it works

The project has two separate parts:

* [render](render/) - Generates a PNG containing the weather forecast at render time. Runs in Google Cloud Function (mostly for convenience).
  * Weather data is fetched from API by Finnish Meteorological Institute
  * HTML, CSS, and Headless Chrome are utilised to generate the PNG file. This part could be done with a lower-level approach, but using CSS for layouting is super convenient.
  * The view is a purposely dumb single HTML file, which has mock data to make development easy. The mock data will be replaced with real data using DOM ids. Not having a build tool removes a lot of unnecessary complexity.

* [rasp](rasp/) - Fetches the PNG from `render`, updates the ePaper display, and goes back to idle. Runs on Raspberry Pi Zero.


## Notes

```sh
jq -c -Rs '{ html: .}' src/templates/weather.html > .temp-body.json

curl -vv -o render.png \
  -X POST \
  -H "content-type: application/json" \
  -d@.temp-body.json \
  https://europe-west3-kimmo-b.cloudfunctions.net/chromium-render

rm -f .temp-body.json
```


* https://api.open-meteo.com/v1/forecast?latitude=62.22&longitude=24.8&hourly=temperature_2m,precipitation,weathercode&daily=weathercode&timezone=Europe%2FHelsinki&start_date=2022-10-31&end_date=2022-11-05

## Credits

* Refresh icon: Created by andriwidodo from The Noun Project
* Severi Salminen for inspiration and assets https://github.com/sevesalm/eInk-weather-display