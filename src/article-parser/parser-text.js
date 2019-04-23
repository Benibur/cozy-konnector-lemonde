'use strict'

const Cheerio = require('cheerio')
let BASE_URL, getStyle

/*
  return a fonction in charge of preparting the text with absolute urls
  based on base_url
 */
module.exports = function(base_url, getStyleFromdic) {
  BASE_URL = base_url
  getStyle = getStyleFromdic
  return getDecoredText
}

/*
Return an array of the text with a /n after each bloc and preserves
text decoration (bold, italic and links)
*/
function getDecoredText(
  node$,
  doTrimHard = false,
  initStyles = { bold: false, italics: false, link: false }
) {
  const textNodes = []

  /* a) launch a recursion of the children */
  initStyles = Object.assign(
    { bold: false, italics: false, link: false },
    initStyles
  )
  getDecoratedTextFromChildren(node$, textNodes, initStyles)

  /* b) remove extra carriage returns and concatenate nodes with same newStyles */
  if (textNodes.length === 0) return []
  const result = []
  let previousTxtN = textNodes[0],
    txtNode,
    hasAReturn,
    hasPreviousAReturn
  result[0] = previousTxtN
  // remove initial \n
  if (doTrimHard) {
    trimHard(previousTxtN)
    if (previousTxtN.text === '\n') {
      previousTxtN.text = ''
    }
  }
  // go throught all textNodes
  for (let i = 1; i < textNodes.length; i++) {
    txtNode = textNodes[i]
    if (doTrimHard) {
      trimHard(txtNode)
    }

    hasPreviousAReturn = hasReturnAndRemoveExtra(previousTxtN)
    if (txtNode.text === '\n') {
      if (hasPreviousAReturn) {
        // previousTxtN already has a return : drop the txtNode
        continue
      } else {
        // else append the return to previousTxtN
        previousTxtN.text += '\n'
      }
    } else if (hasSameStyles(previousTxtN, txtNode)) {
      previousTxtN.text += txtNode.text
    } else {
      result.push(txtNode)
      previousTxtN = txtNode
    }
  }
  return result
}

function getDecoratedTextFromChildren(parent$, res, currentStyles) {
  const children = parent$.contents()
  if (children.length === 0) {
    res.push({ text: parent$.text(), style: Object.assign({}, currentStyles) })
    return
  }
  children.map(function(i, el) {
    // console.log(a, b);
    // console.log(this);
    if (el.nodeType === 8) {
      return
    } // HTML comment : skip
    const el$ = Cheerio(el)

    if (el.type === 'text') {
      res.push({ text: el$.text(), style: Object.assign({}, currentStyles) })
      return
    }
    const tagName = el$.prop('tagName')

    if (tagName === 'BR') {
      res.push({ text: '\n' })
      return
    } else if (tagName === 'STRONG') {
      let newStyles = Object.assign({}, currentStyles)
      newStyles.bold = true
      getDecoratedTextFromChildren(el$, res, newStyles)
    } else if (tagName === 'H3') {
      let newStyles = Object.assign({}, currentStyles)
      newStyles.bold = true
      getDecoratedTextFromChildren(el$, res, newStyles)
    } else if (tagName === 'EM') {
      let newStyles = Object.assign({}, currentStyles)
      newStyles.italics = true
      getDecoratedTextFromChildren(el$, res, newStyles)
    } else if (tagName === 'A') {
      let newStyles = Object.assign({}, currentStyles, getStyle('link'))
      newStyles.link = BASE_URL + el$.attr('href')
      getDecoratedTextFromChildren(el$, res, newStyles)
    } else if (tagName === 'LI') {
      res.push({ text: '- ' })
      getDecoratedTextFromChildren(el$, res, currentStyles)
      res.push({ text: '\n' })
    } else {
      if (blocTags.includes(el$.prop('tagName'))) {
        res.push({ text: '\n' })
      }
      getDecoratedTextFromChildren(el$, res, currentStyles)
      if (blocTags.includes(el$.prop('tagName'))) {
        res.push({ text: '\n' })
      }
    }
  })
}

const blocTags = ['H1', 'H2', 'H3', 'H4', 'P', 'DIV', 'LI', 'OL'],
  startSpacesReg = /^[\s\n]+/,
  endSpacesReg = /[\s\n]+$/

function trimHard(txtNode) {
  trimHardEnd(txtNode)
  if (txtNode.text !== '\n') {
    trimHardStart(txtNode)
  }
}

/* Substitute ending extra spaces and linefeeds with at most one linefeed and one space */
function trimHardEnd(txtNode) {
  let hasAReturn = false
  if (typeof txtNode.text === 'string') {
    let match = txtNode.text.match(endSpacesReg)
    if (match) {
      let replacement = ''
      if (match[0].match(/\n/)) {
        replacement = '\n'
        hasAReturn = true
      } else if (match[0].match(/\s/)) {
        replacement = ' '
      }
      txtNode.text = txtNode.text.substr(0, match.index) + replacement
    }
  }
  return hasAReturn
}

/* Substitute ending extra spaces and linefeeds with at most one linefeed and one space */
function trimHardStart(txtNode) {
  if (typeof txtNode.text === 'string') {
    txtNode.text = txtNode.text.replace(startSpacesReg, '')
  }
}

/* return true if last character is a \n, and remove duplicates trailing [\n\s]+ */
function hasReturnAndRemoveExtra(txtNode) {
  return trimHardEnd(txtNode)
}

function hasSameStyles(a, b) {
  if (!a.style) {
    a.style = {}
  }
  if (!b.style) {
    b.style = {}
  }
  b = b.style
  a = a.style
  // Create arrays of property names
  const aProps = Object.getOwnPropertyNames(a)
  const bProps = Object.getOwnPropertyNames(b)

  // If number of properties is different,
  // objects are not equivalent
  if (aProps.length != bProps.length) {
    return false
  }

  for (let i = 0; i < aProps.length; i++) {
    const propName = aProps[i]
    // If values of same property are not equal,
    // objects are not equivalent
    if (a[propName] !== b[propName]) {
      return false
    }
  }
  // If we made it this far, objects
  // are considered equivalent
  return true
}
