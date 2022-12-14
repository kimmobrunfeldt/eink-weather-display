import puppeteer from 'puppeteer'

export async function createPuppeteer(opts: puppeteer.Viewport) {
  // Launch headless Chrome. Turn off sandbox so Chrome can run under root
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({
    deviceScaleFactor: 1,
    ...opts,
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
