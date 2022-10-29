import fs from 'fs'
import path from 'path'
import puppeteer from 'puppeteer'
;(async () => {
  const { page, browser } = await createPuppeteer()
  const html = await fs.readFileSync(
    path.join(__dirname, 'templates/weather.html'),
    { encoding: 'utf8' }
  )
  const png = await takeScreenshot(page, html, '#test')
  fs.writeFileSync('out.png', png, { encoding: null })
  await browser.close()
})()

async function createPuppeteer(
  { width, height }: puppeteer.Viewport = { width: 800, height: 480 }
) {
  // Launch headless Chrome. Turn off sandbox so Chrome can run under root
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({
    // Higher DPI screenshots
    width,
    height,
    deviceScaleFactor: 1,
  })
  return {
    browser,
    page,
  }
}

async function takeScreenshot(
  page: puppeteer.Page,
  html: string,
  selector?: string
) {
  await page.setContent(html, { waitUntil: 'networkidle0' })

  let element
  if (selector) {
    await page.waitForSelector(selector)
    element = await page.$(selector)
  }

  if (element) {
    return await element.screenshot({ encoding: 'binary' })
  }

  return await page.screenshot({
    fullPage: true,
    encoding: 'binary',
  })
}
