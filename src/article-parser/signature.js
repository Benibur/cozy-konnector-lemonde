/*
  Class to deal the "signature" of a cheerio elements or a string such as 'TAG.class1.class2#id'
  Signature = [string] ['elementName', '.classes-names', '#id']
  Exemples :
    . ['P', '.description-article', '.txt3']
    . ['DIV', '.contenu_article', '.js_article_body', '#articleBody']
  . methods :
    . signature.contains(['DIV','.my-class'])
    . signature.isEqual(['DIV','.my-class'])  // argument is an array, not a signature...
*/
const stringToSignRegex = /(\w*)((\.[\w-]+)*)((#[\w-]+)*)/i

module.exports = class Signature {
  constructor(el$) {
    if (typeof el$ === 'string') {
      this.sign = this._stringToSign(el$)
      return
    }
    this.sign = []
    this.sign.push(el$.prop('tagName'))
    let classList = el$.prop('class')
    classList = classList
      ? '.' +
        classList
          .trim()
          .split(' ')
          .sort()
          .join(' .')
      : ''
    if (classList.length !== 0) {
      this.sign = this.sign.concat(classList.split(' '))
    }
    let idList = el$.prop('id')
    idList = idList
      ? '#' +
        idList
          .trim()
          .split(' ')
          .sort()
          .join(' #')
      : ''
    if (idList.length !== 0) {
      this.sign = this.sign.concat(idList.split(' '))
    }
  }

  toString() {
    return this.sign.join('')
  }

  contains(attributes) {
    if (typeof attributes === 'string') {
      attributes = this._stringToSign(attributes)
    }
    let result = false
    for (let attribute of attributes) {
      if (!this.sign.includes(attribute)) {
        return false
      }
    }
    return true
  }

  _stringToSign(st) {
    let match = st.match(stringToSignRegex)
    let res = [],
      tag,
      classes,
      ids
    tag = match[1]
    classes = match[2]
    ids = match[4]
    if (tag !== '') {
      res[0] = tag
    }
    if (classes !== '') {
      for (let c of classes.split('.')) {
        if (c === '') {
          continue
        }
        res.push('.' + c)
      }
    }
    if (ids !== '') {
      for (let id of ids.split('#')) {
        if (id === '') {
          continue
        }
        res.push('#' + id)
      }
    }
    return res
  }

  isEqual(sign) {
    if (typeof sign === 'string') {
      sign = this._stringToSign(sign)
    }
    if (this.sign.length !== sign.length) {
      return false
    }
    return this.contains(sign)
  }
}
