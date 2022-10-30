import { Node } from 'posthtml'

type Replacement = {
  match: any
  modifier: (node: Node) => void
}

const createPlugin = (replacements: Replacement[]) => {
  return function posthtmlReplace(tree: Node): Node {
    replacements.forEach((replacement) => {
      tree.match(replacement.match, (node) => {
        replacement.modifier(node)
        return node
      })
    })

    return tree
  }
}

export default createPlugin
