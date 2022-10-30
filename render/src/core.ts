import fs from 'fs'
import path from 'path'
import posthtml from 'posthtml'
import posthtmlInlineAssets from 'posthtml-inline-assets'
import { getLocalWeather } from 'src/fmi'
import { createPuppeteer, takeScreenshot } from 'src/puppeteer'
import posthtmlReplace from './posthtmlReplace'

export type GenerateOptions = {
  lat: number
  lon: number
}

export async function generateHtml(opts: GenerateOptions): Promise<string> {
  const weather = getLocalWeather({ lat: opts.lat, lon: opts.lon })

  const html = await fs.readFileSync(
    path.join(__dirname, 'templates/index.html'),
    { encoding: 'utf8' }
  )

  const { html: processedHtml } = await posthtml([
    posthtmlInlineAssets({
      cwd: path.join(__dirname, 'templates/'),
      errors: 'throw',
    }),
    posthtmlReplace([
      {
        match: { attrs: { id: 'date' } },
        modifier: (node) => (node.content = ['Monday, Oct 17']),
      },
    ]),
  ]).process(html)
  return processedHtml
}

export async function generatePng(opts: GenerateOptions): Promise<Buffer> {
  const { page, browser } = await createPuppeteer()
  const html = await generateHtml(opts)
  const png = await takeScreenshot(page, html)
  await browser.close()
  return png
}
