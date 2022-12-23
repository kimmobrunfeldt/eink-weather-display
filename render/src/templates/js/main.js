const DEBUG = false


const uncastedData = JSON.parse(DATA)
const data = {
  ...uncastedData,
  todayDataPoints: uncastedData.todayDataPoints.map(d => ({ ...d, time: new Date(d.time) })),
  tomorrowDataPoints: uncastedData.tomorrowDataPoints.map(d => ({ ...d, time: new Date(d.time) })),
  timeNow: new Date(uncastedData.timeNow)
}
console.log('data', data)

window.addEventListener('load', () => {
  const todayCanvasWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--today-forecast-width'), 10)
  const todayOpts = {
    itemCount: 5,
    canvasWidth: todayCanvasWidth
  }
  drawPrecipitationHistogram(
    initSvg("#temperature-graph-today-precipitation-inner", data.todayDataPoints, todayOpts),
    data.todayDataPoints
  )
  drawPrecipitationHistogram(
    initSvg("#temperature-graph-today-precipitation-outer", data.todayDataPoints, todayOpts),
    data.todayDataPoints,
    { outer: true }
  )
  drawTemperatureLineGraph(
    initSvg("#temperature-graph-today-temp", data.todayDataPoints, todayOpts),
    data.todayDataPoints,
    // Pass today's min max instead of using data points from partial day
    // This makes more sense within the display context because these min/max are also shown as numbers
    { minTemp: data.todayMinTemperature, maxTemp: data.todayMaxTemperature, }
  )

  const tomorrowItemCount = 3
  const tomorrowCanvasWidth = todayCanvasWidth / todayOpts.itemCount * tomorrowItemCount
  const tomorrowOpts = {
    itemCount: tomorrowItemCount,
    canvasWidth: tomorrowCanvasWidth
  }
  drawPrecipitationHistogram(
    initSvg("#temperature-graph-tomorrow-precipitation-inner", data.tomorrowDataPoints, tomorrowOpts),
    data.tomorrowDataPoints
  )
  drawTemperatureLineGraph(
    initSvg("#temperature-graph-tomorrow-temp", data.tomorrowDataPoints, tomorrowOpts),
    data.tomorrowDataPoints,
    { dotRadius: 1.5 }
  )
})

function initSvg(containerSelector, dataPoints, { itemCount, canvasWidth }) {
  const itemWidth = canvasWidth / itemCount
  const barWidth1h = canvasWidth / dataPoints.length

  const canvasHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--graph-height'), 10)
  // Leave room for interpolation and dot drawings
  const canvasPaddingX = 0
  const canvasPaddingY = 6
  const svg = d3.select(containerSelector)

  svg
    .attr("preserveAspectRatio", "xMinYMin meet")
    .attr("viewBox", `0 0 ${canvasWidth} ${canvasHeight}`)
    // Compensate the canvas padding
    .attr("style", `margin: -${canvasPaddingY}px -${canvasPaddingX}px`)

  const minTime = Math.min(...dataPoints.map(dp => dp.time.getTime()))
  const maxTime = Math.max(...dataPoints.map(dp => dp.time.getTime()))
  const scaleX = d3.scaleLinear()
    .domain([minTime, maxTime]) // min and the max of the data
    .range([canvasPaddingX, canvasWidth - barWidth1h - canvasPaddingX])

  return {
    svg,
    scaleX,
    canvasWidth,
    canvasHeight,
    canvasPaddingX,
    canvasPaddingY,
    itemWidth,
    barWidth1h
  }
}

function drawPrecipitationHistogram(svgInfo, dataPoints, { outer = false } = {}) {
  const {
    svg,
    scaleX,
    canvasHeight,
    barWidth1h,
    canvasPaddingY
  } = svgInfo

  const minPrec = 0
  const maxPrec = 5
  const minHeight = 2

  const scalePrecHeight = d3.scaleLinear()
    .domain([minPrec, maxPrec]) // min and the max of the data
    .range([minHeight + canvasPaddingY, canvasHeight - canvasPaddingY])
    .clamp(true)

  const getHeight = (d) => {
    if (d.precipitation1h < 0.01) {
      return 0
    } else if (d.precipitation1h < 1) {
      return minHeight
    }
    return scalePrecHeight(d.precipitation1h)
  }

  svg
    .selectAll('rect')
    .data(outer ? dataPoints.slice(0, -1) : dataPoints)
    .enter()
    .append('rect')
    .attr("width", barWidth1h)
    .attr("height", getHeight)
    .attr("fill", outer ? "var(--color-0)" : "var(--color-1)")
    .attr("x", (d) => scaleX(d.time.getTime()))
    .attr("y", d => scalePrecHeight(10) - getHeight(d))

  if (DEBUG) {
    svg
      .selectAll('text')
      .data(dataPoints)
      .enter()
      .append('text')
      .attr("font-size", "14px")
      .attr("fill", "red")
      .attr("x", (d) => scaleX(d.time.getTime()) + barWidth1h / 2)
      .attr("y", canvasHeight / 2)
      .attr("text-anchor", "middle")
      .text((d) => { return d.localHour; });
  }
}

function drawTemperatureLineGraph(svgInfo, dataPoints, { dotRadius = 3, minTemp = null, maxTemp = null } = {}) {
  const {
    svg,
    scaleX,
    canvasHeight,
    barWidth1h,
    canvasPaddingY
  } = svgInfo

  const min = minTemp !== null ? minTemp : Math.min(...dataPoints.map(dp => dp.temperature))
  const max = maxTemp !== null ? maxTemp : Math.max(...dataPoints.map(dp => dp.temperature))
  const scaleTempY = d3.scaleLinear()
    .domain([min, max]) // min and the max of the data
    .range([canvasHeight - canvasPaddingY, canvasPaddingY])

  const line = d3.line()
    .curve(d3.curveCatmullRom.alpha(.5))
    .x((d) => scaleX(d.time.getTime()) + barWidth1h / 2)
    .y((d) => scaleTempY(d.temperature))

  svg.append("path")
    .datum(dataPoints)
    .attr("fill", "none")
    .attr("stroke", "var(--color-1)")
    .attr("stroke-width", 1)
    .attr("d", line)

  if (dotRadius !== null) {
    const minToMs = (m) => m * 60 * 1000
    svg
      .selectAll('circle')
      .data(dataPoints)
      .enter()
      .append('circle')
      .attr("r", dotRadius)
      .attr("fill", (d) => d.time.getTime() + minToMs(60 + 30 /* 30 min as buffer */) < data.timeNow.getTime() ? "var(--color-1)" : "var(--color-2)")
      .attr("cx", (d) => scaleX(d.time.getTime()) + barWidth1h / 2)
      .attr("cy", (d) => scaleTempY(d.temperature))
  }
}
