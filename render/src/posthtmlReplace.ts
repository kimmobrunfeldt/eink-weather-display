import { Node } from 'posthtml'

type Replacement = {
  match: any
  newContent?: string
  modifier?: (node: Node) => void
}

const createPlugin = (replacements: Replacement[]) => {
  return function posthtmlReplace(tree: Node): Node {
    replacements.forEach((replacement) => {
      tree.match(replacement.match, (node) => {
        if (replacement.newContent) {
          node.content = [replacement.newContent]
        } else if (replacement.modifier) {
          replacement.modifier(node)
        }

        return node
      })
    })

    return tree
  }
}

export default createPlugin
