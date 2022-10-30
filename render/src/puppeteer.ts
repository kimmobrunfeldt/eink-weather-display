import puppeteer from 'puppeteer'

const createDefaults = () => ({
  // 10.3" Waveshare e-ink display resolution
  width: 1872,
  height: 1404,
})

export async function createPuppeteer(
  { width, height }: puppeteer.Viewport = createDefaults()
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

export async function takeScreenshot(
  page: puppeteer.Page,
  html: string,
  selector?: string
): Promise<Buffer> {
  await page.setContent(html, { waitUntil: 'networkidle0' })

  let element
  if (selector) {
    await page.waitForSelector(selector)
    element = await page.$(selector)
  }

  if (element) {
    return (await element.screenshot({ encoding: 'binary' })) as Buffer
  }

  return (await page.screenshot({
    fullPage: true,
    encoding: 'binary',
  })) as Buffer
}
