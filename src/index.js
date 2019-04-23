'use strict'

/******************************************************************************

  This is a Cozy connector in charge of retrieving the data from
  your https://lemonde.fr account.

*******************************************************************************/

/*******************************************
  GLOBALS
*********************************************/
const {
    BaseKonnector,
    requestFactory,
    saveBills,
    log,
    errors,
    cozyClient
  } = require('cozy-konnector-libs'),
  parseArticle = require('./article-parser/parser2'),
  sanitizeFileName = require('sanitize-filename'),
  moment = require('moment'),
  Promise = require('bluebird'),
  // pdfPrinter       = require('./pdf-printer'),
  parsePurchase = require('./purchase-parser/purchase-parser'),
  parseInvoices = require('./purchase-parser/invoices-parser')

const baseUrl = 'http://abonnes.lemonde.fr'
const ARTICLE_DOWNLOADS_CONCURRENCY = 5
let NUMBER_OF_ARTICLES_TO_RETRIEVE = 1000000000
var USER_ID // static ID for the session
var FOLDER_PATH // retrieved in "fields"
var FIELDS

// FOR TEST :
// If true, will download and save locally in ./data/* folders all the html files used during the connector
// life cycle (bookmarked articles, pucharses, invoices).
const DEBUG_MODE = true,
  FS = require('fs'),
  ARTICLES_HTML_PATH = './data/articles_html/',
  ARTICLES_LIST_PATH = './data/articles_html/00-articles_list.json',
  PURCHASES_FILES_PATH = './data/purchases/',
  INVOICES_FILES_PATH = './data/invoices-lists/',
  INVOICES_PDF_PATH = './data/invoices-pdf/',
  TESTS_DIRECTORIES = [
    ARTICLES_HTML_PATH,
    ARTICLES_LIST_PATH,
    PURCHASES_FILES_PATH,
    INVOICES_FILES_PATH,
    INVOICES_PDF_PATH
  ]
if (DEBUG_MODE) {
  NUMBER_OF_ARTICLES_TO_RETRIEVE = 5
  TESTS_DIRECTORIES.forEach(d => {
    // create test directories if it
    if (!FS.existsSync(d)) require('mkdirp').sync(d)
  })
}

/*******************************************
  MAIN
*********************************************/
module.exports = new BaseKonnector(start)

async function start(fields) {
  FIELDS = fields
  FOLDER_PATH = fields.folderPath

  log('info', 'Authenticating ...')
  await authenticate(fields.login, fields.password)
  log('info', 'Successfully logged in')

  log('info', 'Fetching the invoices')
  // await retriveInvoices()

  log('info', 'Fetching the articles')
  await retriveArticles()
}

/*******************************************
  AUTHENTIFICATION
  3 steps :
    1- get a connection__token
    2- create a session
    3- get USER_ID
*********************************************/
function authenticate(username, password) {
  // 1- Get the a token of a page
  return (
    requestFactory({ jar: true, cheerio: true, json: false })
      .get('https://secure.lemonde.fr/sfuser/connexion')

      // 2. Create a session
      .then($ => {
        const token = $('#connection__token').val()
        return requestFactory({ jar: true, cheerio: true })
          .post({
            uri: 'https://secure.lemonde.fr/sfuser/connexion',
            form: {
              'connection[mail]': username,
              'connection[password]': password,
              'connection[stay_connected]': 1,
              'connection[save]': '',
              'connection[_token]': token
            }
          })
          .catch(err => {
            log('error', 'Server connection failed' + err) // TODO tell the stack login is Nok
            throw new Error(errors.VENDOR_DOWN)
          })
      })

      // 3. Get USER_ID
      .then(() => {
        return requestFactory({ jar: true, cheerio: false, json: true })
          .get('http://www.lemonde.fr/sfuser/sfws/auth/user/')
          .then(data => {
            if (typeof data.id !== 'string') {
              log('error', 'Authentification failed')
              throw new Error(errors.LOGIN_FAILED)
            }
            USER_ID = data.id
          })
          .catch(() => {
            log('error', 'Server connection failed for id')
            throw new Error(errors.VENDOR_DOWN)
          })
      })
  )
}

/*******************************************
  INVOICES RETRIEVAL
    1- get purchases (several invoices for one purchase)
    2- save invoices
********************************************/

function retriveInvoices() {
  return (
    requestFactory({ jar: true, cheerio: true })
      // 1- get purchases
      .get('https://moncompte.lemonde.fr/sales/order/history/')
      // 2- parse purchases to get invoices data
      .then($ => {
        if (DEBUG_MODE) {
          FS.writeFileSync(
            PURCHASES_FILES_PATH + 'purchases-page.html',
            $.html()
          )
        }
        return parsePurchase($, DEBUG_MODE, INVOICES_FILES_PATH)
      })
      // 3- save invoices
      .then(purchases => saveInvoices(purchases))
  )
}

function saveInvoices(purchases) {
  // Purchases rows structure :
  //  [0:purchase date, 1:description, 2:purchase number, 3:purchase amount, 4:invoices url]
  purchases.map(async purchase => {
    const invoicesUrl = purchase[4]
    if (invoicesUrl === '') {
      // happens for purchases made trought Google : the invoice is then in the Google account
      return
    }
    return requestFactory({ jar: true, json: false, cheerio: true })
      .get(invoicesUrl)
      .then($ => {
        if (DEBUG_MODE) {
          // then we save the invoices file for tests
          const filepath =
            INVOICES_FILES_PATH + 'invoices-from-puchase-' + purchase[2]
          FS.writeFileSync(filepath + '.html', $.html())
          FS.writeFileSync(filepath + '.url', invoicesUrl)
        }
        const invoicesList = parseInvoices($)
        return invoicesList
      })
      .mapSeries(invoiceRow => {
        const data = purchase.concat(invoiceRow)
        // data structure :
        // [
        //   0:purchase date,
        //   1:purchase description,
        //   2:purchase number,
        //   3:purchase amount,
        //   4:invoices url,
        //   5:invoice amount,
        //   6:payment mean,
        //   7:invoice date,
        //   8:invoices url
        // ]

        const invoiceDate = moment(data[7], 'DD/MM/YYYY')
        let filename = `${invoiceDate.format(
          'YYYY-MM-DD'
        )} - LeMonde - facture - `
        let amount = data[5].toFixed(2) + '€'
        filename =
          filename +
          ' '.repeat(Math.max(0, 40 - filename.length - amount.length)) +
          amount +
          '.pdf'
        if (DEBUG_MODE) {
          // then we save the invoice for tests
          return requestFactory({ jar: true, json: false, cheerio: false })
            .get({
              uri: invoiceRow[3],
              encoding: null,
              resolveWithFullResponse: true
            })
            .then(resp => {
              const filepath = INVOICES_PDF_PATH + filename
              log(
                'debug',
                `Save invoice ${invoiceRow[3]} in file : ${filepath}`
              )
              FS.writeFileSync(filepath, resp.body)
              FS.writeFileSync(filepath + '.url', invoiceRow[3])
            })
            .delay(500) // if too fast, the server responds a 503...
        }

        // TODO : deduplicate & save the invoice in Cozy linkBankOperations ?
        // is it better to prepare all bills and do a single saveBills ?
        // how does saveBills deduplicate ?
        const bill = {
          type: 'media',
          vendor: 'LeMonde',
          date: invoiceDate.toDate(),
          amount: data[5],
          currency: 'EUR',
          fileurl: data[8],
          filename: filename
        }
        return saveBills([bill], FIELDS, { identifiers: ['monde'] }).delay(500) // if too fast, the server responds a 503...
      })
  })
  return true
}

/*******************************************
  RETRIEVE BOOKMARKED ARTICLES
    a) get list of bookmarked article
    b) retrieve articles content
    c) sanitize hml to get pdfDefinition
    d) save the pdf
    e) save the article document and the bookmark in Cozy
********************************************/
function retriveArticles() {
  let bookmarksIndexStart = 0,
    bookmarksIndexStop = NUMBER_OF_ARTICLES_TO_RETRIEVE
  bookmarksIndexStop = Math.max(1, bookmarksIndexStop)
  var request = requestFactory({
    jar: true,
    json: true,
    cheerio: false
  })

  // a) get list of bookmarked article
  let articlesPromise
  if (false && DEBUG_MODE) {
    // for debug. To test a specific article (just change its url)
    const articleList = [
      {
        id: 193860,
        title: 'L’affaire Richard Ferrand résumée en cinq points',
        chapo:
          'Alors que les avocats du chef de file des députés LREM demandent le dépaysement de l’instruction, retour sur les grandes lignes du dossier.',
        authors: 'Alexandre Pouchard',
        type: 'Décryptages',
        media: '',
        url:
          '/big-browser/article/2018/10/11/trois-heures-de-garde-a-vue-pour-avoir-mal-scanne-des-articles-chez-ikea_5368025_4832693.html',
        date: '2018-03-21T13:06:12.592Z',
        dateBookmarked: '2017-10-01T00:00:00+02:00'
      }
    ]
    articlesPromise = Promise.resolve(articleList)
  } else {
    articlesPromise = request({
      uri: `http://www.lemonde.fr/sfuser/sfws/user/${USER_ID}/classeur/edito/${bookmarksIndexStart}/${bookmarksIndexStop}`
    }).then(body => {
      const bookmarkSessions = body.articles
      let articlesList = []
      for (let key in bookmarkSessions) {
        for (let article of bookmarkSessions[key].articles) {
          article.dateBookmarked = bookmarkSessions[key].dateAddedIso
        }
        articlesList = articlesList.concat(bookmarkSessions[key].articles)
      }
      if (DEBUG_MODE) {
        log('debug', `Save articles list in : ${ARTICLES_LIST_PATH}`)
        FS.writeFile(
          ARTICLES_LIST_PATH,
          `number of articles = ${articlesList.length}\n` +
            JSON.stringify(articlesList),
          () => {}
        )
      }
      // TODO : deduplicates already downloaded articles (on article.id ?)
      return articlesList
    })
  }

  // b) retrieve articles content
  // article content :
  //     {
  //       title          : 'Un décès sur cinq dans le monde dû à une mauvaise alimentation',
  //       chapo          : 'Une vaste étude évalue l’impact sanitaire d’un régime alimentaire déséquilibré',
  //       authors        : 'Paul BenkimounMathilde Gérard',
  //       type           : 'Enquête',
  //       media          : '',
  //       url            : 'http://abonnes.lemonde.fr/planete/article/2019/04/04/un-deces...',
  //       date           : '2019-04-04T13:03:19.100Z',
  //       dateBookmarked : '2019-04-01T00:00:00+02:00',
  //       baseUrl        : 'http://abonnes.lemonde.fr',
  //       rawHtml        : {text}
  //       html$          : {cheerio object}
  //       filename       : '2019-04-04 - Un décès sur cinq dans le monde dû à une mauvaise alimentation',
  //       inlinedHtml    :
  //     }
  return articlesPromise.map(
    article => {
      if (article.url !== null) {
        article.baseUrl = baseUrl
        article.url = `${baseUrl}${article.url}`
      }
      log('info', `we retrieve article : ${article.url}`)
      // prepare the promise to get the article content
      let getArticlePromise
      if (!article.url) {
        // for some nUnknown reasons, article.url may equal null ... even in the web page of LeMonde, the corresponding
        // bookmarked article has no link... looks like a bug in LeMonde.
        getArticlePromise = Promise.resolve('')
      } else {
        getArticlePromise = requestFactory({
          jar: true,
          json: false,
          cheerio: true
        })({ uri: article.url })
      }
      return (
        getArticlePromise

          // c) sanitize HTML and inline its assets
          .then(html$ => {
            article.rawHtml = html$.html()
            article.html$ = html$
            article.filename = sanitizeFileName(
              moment(article.date).format('YYYY-MM-DD') + ' - ' + article.title
            )
            if (html$ === '') {
              // case when article.url is null (bug from LeMonde)
              return Promise.resolve(article)
            } else {
              return parseArticle(article)
            }
          })
          .catch(err => {
            // sanitization went wrong
            log('error', err.toString())
            return article
          })

          // d) save the article
          .then(article => {
            if (article.url !== null) {
              if (DEBUG_MODE) {
                /*
          Only for test : store html file in ARTICLES_HTML_PATH
          So that we can test and adjust the html of the article
          */
                let filename = ARTICLES_HTML_PATH + article.filename
                log(
                  'DEBUG',
                  `Save article in : $(filename).html, $(article.url)`
                )
                const fs = require('fs')
                fs.writeFileSync(
                  filename + '.html',
                  article.inlinedHtml,
                  () => {}
                )
                fs.writeFileSync(filename + '.url', article.url, () => {})
              }
              // save the html of the
              const fileDoc = cozyClient.files.create(article.inlinedHtml, {
                // TODO deduplicate if article already retrieved (à faire en amont non ?)
                name: article.filename + '.html',
                dirID: '', // TODO
                contentType: 'text/html'
              })
              return fileDoc
            }
          })
          // e) save the bookmark in Cozy
          // data structure : TODO : choose and implement :-)
          // option 1 : a bookmark : you bookmark an online article that has a copy in your FS. This copy can be annoted and your bookmark reference both the copy and online versions.
          // Option 2 : a "bookmark" is a note of a special type that contains an inlined copy of the html. Therefore as a note, it can be easyly augmented.
          // ==> mon impression :
          //  l'article doit être un "marbre", que l'on peut annoter et transformer en note.
          //  Potentiellement ce "marbre" peut être ré importer (changement format vidéo, amélioration de l'import...)
          //  reste le bookmark : une note d'un type particulier ou bien un objet en tant que tel ?
          .then(fileDoc => {
            const bookmark = {
              title: article.title,
              articleDate: article.date,
              bookmarkedDate: article.dateBookmarked,
              url: article.url,
              copyId: fileDoc._id,
              tags: '         ',
              note: ''
            }
            cozyClient.data.create('bookmark', bookmark)
          })
      )
    },
    { concurrency: ARTICLE_DOWNLOADS_CONCURRENCY }
  )
}

// /*****************************************
//   RETRIEVE  ACCOUNT INFORMATION
// ******************************************/
// TODO when profile data is ready
//   .then( () => {
//     req = requestFactory({
//       jar : true,
//       json: false,
//       cheerio: true
//     })
//     return req({
//       uri: 'https://moncompte.lemonde.fr/customer/account/',
//     })
//
//   }).then($ => {
//     log('', $.html());
//   })

// /*****************************************
//   RETRIEVE  PERSONAL INFORMATION
// ******************************************/
//
//   .then( () => {
//     req = requestFactory({
//       jar : true,
//       json: false,
//       cheerio: true
//     })
//     return req({
//       uri: 'https://moncompte.lemonde.fr/sales/order/history/',
//     })
//
//   }).then($ => {
//     console.log($.html());
//   })
