import fs from 'fs'
import _ from 'lodash'
import mimeTypes from 'mime-types'
import { Node } from 'posthtml'
import { getPathWithinSrc } from 'src/utils/utils'

const posthtmlInlineStyleCssImports = () => {
  return (tree: Node): Node => {
    tree.match({ tag: 'style' }, (node) => {
      const css = node.content?.[0]
      if (!_.isString(css)) {
        return node
      }

      // Regex is good enough here
      const processedCss = css.replace(
        /url\('(.*?)'\)/gi,
        (match, contents) => {
          const dataMime = `data:${mimeTypes.lookup(contents)}`
          const fileContent = fs.readFileSync(
            getPathWithinSrc('templates/', contents)
          )
          return `url(${dataMime};base64,${fileContent.toString('base64')})`
        }
      )

      node.content = [processedCss]
      return node
    })

    return tree
  }
}

export default posthtmlInlineStyleCssImports
