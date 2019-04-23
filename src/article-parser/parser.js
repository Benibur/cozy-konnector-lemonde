const sizeOf = require('image-size'),
  Cheerio = require('cheerio'),
  ArticleParsingError = require('../Errors'),
  path = require('path'),
  getPdfTemplate = require(path.join(__dirname, './templates/pdf.template.js')),
  getDescriptionTemplate = require(path.join(
    __dirname,
    './templates/description.template.js'
  )),
  getTitleTemplate = require(path.join(
    __dirname,
    './templates/title.template.js'
  )),
  Promise = require('bluebird'),
  Request = require('request-promise'),
  Signature = require('./signature'),
  GetgetDecoredText = require('./parser-text')

const SELECTORS_TO_REMOVE =
  '.ea_article, .toolbar, .mgb16, .bandeau_matinale, .dfp_slot, .video_player, SCRIPT, .content-labels'

/* !!!!!!!!!!!!!!!!!!!!!!!!!!!

  CURRENTLY NOT USED : we don't store the pdf, but an inlined html version.
  the files are kept just in case, should be deleted if the choice is validated.

!!!!!!!!!!!!!!!!!!!!!!!!!!!  */

/*
  MAIN :
  . expects article {html$, baseUrl, url}
    . html$   : the html Cheerio Object
    . baseUrl : a string containing the url to turn relative links into absolute urls
    . url : {string} absolute url to the article
  . return : a promise returning the article augmented with {pdfDefinition}
*/

/*
  TODO
  . manage embeded video, exemple : http://abonnes.lemonde.fr/sport/article/2018/01/25/jusqu-ou-iront-les-retombees-du-scandale-d-abus-sexuels-apres-la-condamnation-de-larry-nassar_5247189_3242.html
  . manage embeded gephy: exemple : http://abonnes.lemonde.fr/sport/article/2018/01/25/jusqu-ou-iront-les-retombees-du-scandale-d-abus-sexuels-apres-la-condamnation-de-larry-nassar_5247189_3242.html
*/

module.exports = article => {
  const imagesToFetch = []

  try {
    getDecoredText = GetgetDecoredText(article.baseUrl, getStyle)

    /* prepare pdfDefinition of the article */
    const art$ = article.html$('article')
    art$.find(SELECTORS_TO_REMOVE).remove()
    console.log(logElement(art$))
    const headContentData = {
        title: getTitleTemplate(), // the template of the title is in the template
        description: [],
        signature: [],
        illustration_haut: null
      },
      bodyContent = []
    // loop on each children nodes
    art$.children().each((i, el) => {
      let el$ = Cheerio(el)
      const sign = new Signature(el$)

      /* Article title */
      if (el$.prop('tagName') == 'H1') {
        headContentData.title.table.body[0][1].text = getDecoredText(el$)
        return

        /* Article description */
      } else if (
        sign.contains('P.description') ||
        sign.contains('DIV.description') ||
        sign.contains('P.description-article')
      ) {
        headContentData.description.push(getDecoredText(el$))
        return

        /* Article signature */
      } else if (
        sign.contains(['P', '.bloc_signature']) ||
        sign.contains('DIV.credits') ||
        sign.contains('P.signature') ||
        sign.contains('P.content-byline') ||
        sign.contains('P.content-metaline')
      ) {
        headContentData.signature.push([el$.text().replace(/\s+/g, ' ')])
        return

        /* Article body */
      } else if (sign.contains('DIV.contenu_article')) {
        // loop on the body's children
        el$.children().each((i, el) => {
          let el$ = Cheerio(el)
          const sign = new Signature(el$)

          /* Article body - question */
          if (sign.contains('H2') || sign.contains(['P', '.question'])) {
            bodyContent.push({
              style: 'H2',
              text: getDecoredText(el$)
            })

            /* Article body - paragraph */
          } else if (sign.isEqual('P')) {
            bodyContent.push({
              style: 'p',
              text: getDecoredText(el$)
            })

            /* Article body - encart gauche */
          } else if (sign.contains(['DIV', '.encart_retrait_gauche'])) {
            bodyContent.push({
              margin: [40, 20, 40, 10],
              style: { italics: true, color: '#555555' },
              table: {
                widths: ['*'],
                body: [
                  [
                    {
                      border: [false, true, false, true],
                      text: getDecoredText(el$)
                    }
                  ]
                ]
              },
              layout: {
                hLineColor: '#555555'
              }
            })

            /* Article body - reference */
          } else if (sign.isEqual(['P', '.reference'])) {
            bodyContent.push({
              style: 'reference',
              text: getDecoredText(el$)
            })

            /* Article body - ASIDE.fenetre TODO */
          } else if (sign.isEqual(['ASIDE', '.fenetre'])) {
            // console.log('ASIDE.fenetre', article.url);
            // console.log(logElement(el$));
            el$.children().each((i, el) => {
              const el$ = Cheerio(el)
              const sign = new Signature(el$)

              if (sign.isEqual(['SPAN', '.titre']) || sign.contains(['H3'])) {
                bodyContent.push({
                  style: 'fenetre',
                  text: getDecoredText(
                    el$,
                    true,
                    getStyle('fenetre', { bold: true })
                  )
                })
                return
              } else if (sign.isEqual(['P', '.lire'])) {
                bodyContent.push({
                  style: 'fenetre',
                  text: getDecoredText(el$, true, getStyle('fenetre'))
                })
                return
              } else if (sign.isEqual(['DIV'])) {
                // let el$ = el.
                bodyContent.push({
                  style: 'fenetre',
                  text: getDecoredText(el$, true)
                })
                return
              } else if (sign.isEqual(['P'])) {
                bodyContent.push({
                  style: 'fenetre',
                  text: getDecoredText(el$, true)
                })
              }
            })

            /* Article body - lire aussi */
          } else if (sign.isEqual(['P', '.lire'])) {
            bodyContent.push({
              style: 'SeeAlso',
              text: getDecoredText(el$, true, getStyle('SeeAlso'))
            })

            /* Article body - lire aussi dans un multimedia snippet */
            /* Plusieurs cas possibles */
          } else if (sign.contains('DIV.multimedia-embed.snippet')) {
            /* Article body DIV.multimedia-embed.snippet - "see also" */
            if (new Signature(el$.children().first()).contains('P.lire')) {
              bodyContent.push({
                style: 'SeeAlso',
                text: getDecoredText(
                  el$.children().first(),
                  true,
                  getStyle('SeeAlso')
                )
              })
              return
            }

            /* Article body DIV.multimedia-embed.snippet - "documents sur scribd.com" */
            const iframe$ = Cheerio(el$.find('IFRAME'))
            if (
              iframe$.length > 0 &&
              iframe$.attr('src').includes('scribd.com')
            ) {
              const textNode = el$.find('A').first()
              bodyContent.push({
                text: [
                  'Consultez les documents sur Scribd :\n',
                  {
                    text: textNode.text(),
                    link: textNode.attr('href'),
                    style: 'link'
                  }
                ],
                style: 'SeeAlso'
              })
            }

            /* Article body - tweet */
          } else if (sign.contains('.twitter-tweet')) {
            let tweetUrl = 'https:' + el$.find('A').attr('href')
            let twweetStyle = getStyle('Tweet')
            twweetStyle.link = tweetUrl
            let txt = getDecoredText(el$, false, twweetStyle)

            txt.push({
              image: 'tweetIcone',
              width: 20
            })
            bodyContent.push({
              margin: [10, 0, 40, 0],
              table: {
                widths: [22, '*'],
                body: [
                  [
                    { image: 'tweetIcone', width: 20, margin: [0, 20, 5, 0] },
                    { text: txt }
                  ]
                ]
              },
              layout: 'noBorders'
            })

            /* Article body -  photo portfolio */
          } else if (sign.contains('SECTION.conteneur-portfolio')) {
            const table = {
              margin: [0, 0, 0, 0],
              layout: {
                fillColor: '#000'
              },
              style: 'portfolioCaption',
              table: {
                widths: ['*'],
                body: [],
                dontBreakRows: true
              }
            }
            const rows = table.table.body
            el$.find('IMG').each((i, el) => {
              // due to lazy loading, the url might be in src or in data-src
              let src = el.attribs.src
              if (!src.startsWith('http')) {
                src = el.attribs['data-src']
              }
              const imageNode = {
                image: '',
                width: 300,
                style: 'portfolioIllustration'
              }
              imagesToFetch.push({
                imageNode: imageNode,
                url: src
              })
              rows.push([
                {
                  style: { alignment: 'center' },
                  table: {
                    widths: ['*'],
                    body: [
                      [imageNode],
                      [
                        {
                          text: el.attribs.alt,
                          style: 'portfolioCaption'
                        }
                      ]
                    ]
                  }
                }
              ])
            })
            bodyContent.push(table)

            /* Article body - figure */
          } else if (sign.contains(['FIGURE'])) {
            const imageNode = {
              image: 'tweetIcone',
              width: 300,
              style: 'illustration'
            }
            imagesToFetch.push({
              imageNode: imageNode,
              url: el$.find('IMG').attr('src')
            })
            bodyContent.push(imageNode)
            const caption = el$.find('IMG').attr('alt')
            bodyContent.push({ text: caption, style: 'illustrationCaption' })

            /* Article body - citation */
          } else if (
            sign.isEqual('BLOCKQUOTE.citation') ||
            sign.isEqual('BLOCKQUOTE')
          ) {
            bodyContent.push({
              margin: [20, 20, 20, 10],
              style: { italics: true, color: '#777777' },
              table: {
                widths: ['*'],
                body: [
                  [
                    {
                      border: [true, false, false, false],
                      text: getDecoredText(el$, false)
                    }
                  ]
                ]
              },
              layout: {
                vLineColor: '#b9c0c5',
                vLineWidth: () => 3,
                paddingTop: (i, node) => 0,
                paddingBottom: (i, node) => 10
              }
            })

            /* Article body - ordered list */
          } else if (sign.contains('OL')) {
            // TODO for now, pdfmake allows only string in LI items (no styles) :   https://github.com/bpampuch/pdfmake/issues/881
            el$.children().each((i, el) => {
              bodyContent.push({
                text: [i + 1 + ' - '].concat(getDecoredText(Cheerio(el))),
                margin: [0, 10, 0, 0]
              })
            })

            /* Article body - unordered list */
          } else if (sign.contains('UL')) {
            // TODO for now, pdfmake allows only string in LI items (no styles) :   https://github.com/bpampuch/pdfmake/issues/881
            el$.children().each((i, el) => {
              bodyContent.push({
                text: ['- '].concat(getDecoredText(Cheerio(el))),
                margin: [0, 10, 0, 0]
              })
            })
          } else {
            throw new ArticleParsingError(
              `Html format of the article body is nos as expected\nUnknown element is : ${logElement(
                el$
              )}`
            )
          }
        })
        return
      } else {
        throw new ArticleParsingError(
          `html format of the article is nos as expected\nUnknown element is :${logElement(
            el$
          )}`
        )
      }
    })

    /* look for "Sur le même sujet" */
    const seeAlsoBloc$ = article.html$('.meme_sujet')
    if (seeAlsoBloc$.length > 0) {
      let title
      const ul = []
      const table = {
        margin: [0, 20, 0, 0],
        style: { bold: true },
        table: {
          widths: ['*'],
          body: [
            [
              {
                border: [false, true, false, false],
                text: 'Sur le même sujet'
              }
            ]
          ]
        },
        layout: {
          hLineColor: '#000000',
          hLineWidth: () => 1,
          paddingTop: (i, node) => 10,
          paddingBottom: (i, node) => 0
        }
      }
      const body = table.table.body
      seeAlsoBloc$.find('LI').each((i, el) => {
        body.push([
          {
            border: [false, false, false, false],
            ul: getDecoredText(Cheerio(el), true, { bold: true })
          }
        ])
      })
      bodyContent.push(table)
    }

    /* finalise head definition */
    const headContent = []
    // push title
    headContent.push(headContentData.title)
    // preparte the signature with the link to the online article
    if (article.url) {
      headContentData.signature.push({
        text: '\nArticle en ligne',
        link: article.url,
        style: 'link'
      })
    }
    // if there is an illustration, use the template with a table for description, signature and illustration
    if (headContentData.illustration_haut) {
      const descriptionTemplate = getDescriptionTemplate()
      const body = descriptionTemplate.table.body
      body[0][0].text = headContentData.description
      body[1][0].text = headContentData.signature
      imagesToFetch.push({
        imageNode: body[0][1],
        url: headContentData.illustration_haut.find('IMG').attr('src')
      })
      headContent.push(descriptionTemplate)
      // othenwise just add two paragraphs for description and signature
    } else {
      if (headContentData.description.length !== 0) {
        headContent.push({
          style: 'description',
          text: headContentData.description
        })
      }
      if (headContentData.signature.length !== 0) {
        headContent.push({
          style: 'signature',
          text: headContentData.signature
        })
      }
    }

    /* finalise pdf definition */
    let pdfTemplate = getPdfTemplate()
    pdfTemplate.content = headContent.concat(bodyContent)
    article.pdfDefinition = pdfTemplate

    /* return the promise wich will be resolved when all the images of the page will have been downloaded  */
    return Promise.map(imagesToFetch, image => {
      return Request({
        uri: image.url,
        encoding: 'binary',
        resolveWithFullResponse: true
      }).then(res => {
        let type = res.headers['content-type'],
          binary = new Buffer(res.body, 'binary'),
          dimensions = sizeOf(binary),
          base64 = binary.toString('base64'),
          prefix = `data:image/${dimensions.type};base64,`,
          dataURI = prefix + base64
        image.imageNode.image = dataURI
      })
    }).then(res => {
      // console.log("fin load des images, on retourne l'article", article.url)
      return article
    })

    // in case of an error during parsing, catch the error as a rejected promise
  } catch (e) {
    const art$ = article.html$('article')
    // console.log('full article :\n', logElement(art$))
    return Promise.reject(
      '\n' +
        e.toString() +
        `article url : ${article.url}` +
        '\nfull article structure:\n' +
        logElement(art$) +
        'stacktrace:\n' +
        e.stack
    )
  }
}

/* get a style from the template and override its properties with those provided */
const stylesDic = getPdfTemplate().styles
function getStyle(styleName, addedStyles) {
  return Object.assign({}, stylesDic[styleName], addedStyles)
}

/*
 helper, return a string representing the tree of elements
*/
function logElement(el$, indentation = '') {
  let prefixe = indentation
  const sign = new Signature(el$)
  prefixe += '|-' + sign.toString()
  let l = 35 - prefixe.length
  l = l < 2 ? 1 : l
  prefixe += new Array(l - 1).join(' ')
  let extract = el$.text()
  extract = extract ? extract.trim().substr(0, 40) : ''
  extract = extract.replace(/\n/gm, ' ')
  extract = extract == '' ? '[no text]' : '[' + extract + '...'
  let log = prefixe + extract + '\n'
  el$.children().each(function(i, el) {
    log += logElement(Cheerio(el), indentation + '  ')
  })
  return log
}
