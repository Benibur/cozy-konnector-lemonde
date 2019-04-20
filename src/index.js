'use strict'

/******************************************************************************

  This is a Cozy connector in charge of retrieving the data from
  your https://lemonde.fr account.

*******************************************************************************/



/*******************************************
  GLOBALS
*********************************************/
const {
      BaseKonnector ,
      requestFactory,
      signin        ,
      scrape        ,
      saveBills     ,
      log           ,
      errors        ,
      cozyClient    ,
      saveFiles
}                      = require('cozy-konnector-libs'),
      // parseArticle     = require('./article-parser/parser'),
      // sanitizeFileName = require('sanitize-filename'),
      moment           = require('moment'),
      // pdfPrinter       = require('./pdf-printer'),
      parsePurchase    = require('./purchase-parser/purchase-parser'),
      parseInvoices    = require('./purchase-parser/invoices-parser')

const baseUrl                        = 'http://abonnes.lemonde.fr'
const ARTICLE_DOWNLOADS_CONCURRENCY  = 5          // TODO adapt for production
let   invoicesTable                  = []         // a global variable to ease the different treatments on the table
let   NUMBER_OF_ARTICLES_TO_RETRIEVE = 1000000000
var   USER_ID                                     // static ID for the session
var   FOLDER_PATH                                 // retrieved in "fields"
var   FIELDS

// FOR TEST :
// If true, will download and save locally in ./data/* folders all the html files used during the connector
// life cycle (bookmarked articles, pucharses, invoices).
const DEBUG_MODE           = true,
      ARTICLES_HTML_PATH   = './data/articles_html/',
      ARTICLES_LIST_PATH   = './data/articles_html/00-articles_list.json',
      PURCHASES_FILES_PATH = './data/purchases/',
      INVOICES_FILES_PATH  = './data/invoices-lists/',
      INVOICES_PDF_PATH    = './data/invoices-pdf/'
if (DEBUG_MODE) {
      NUMBER_OF_ARTICLES_TO_RETRIEVE = 5
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
  await retriveInvoices()

  log('info', 'Fetching the articles')
  // await retriveArticles()

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
  return requestFactory({jar:true,cheerio:true,json:false})
    .get('https://secure.lemonde.fr/sfuser/connexion')

  // 2. Create a session
    .then($ => {
      const token = $('#connection__token').val()
      return requestFactory({jar:true,cheerio:true})
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
      .catch((err)=>{
        log('error', 'Server connection failed') // TODO tell the stack login is Nok
        throw new Error(errors.VENDOR_DOWN)
      })
    })

    // 3. Get USER_ID
    .then((res) => {
      return requestFactory({jar:true,cheerio:false,json:true})
      .get('http://www.lemonde.fr/sfuser/sfws/auth/user/')
      .then(data => {
        if (typeof data.id !== 'string') {
          log('error', 'Authentification failed')
          throw new Error(errors.LOGIN_FAILED)
        }
        USER_ID = data.id
      })
      .catch(()=>{
        log('error', 'Server connection failed for id')
        throw new Error(errors.VENDOR_DOWN)
      })
    })
}



/*******************************************
  INVOICES RETRIEVAL
    1- get purchases (several invoices for one purchase)
    2- save invoices
********************************************/

function retriveInvoices() {
  return requestFactory({jar:true,cheerio:true})
  // 1- get purchases
  .get('https://moncompte.lemonde.fr/sales/order/history/')
  // 2- parse purchases to get invoices data
  .then($ => {
    if (DEBUG_MODE) { require('fs').writeFileSync(PURCHASES_FILES_PATH + 'purchases-page.html', $.html()) }
    return parsePurchase($, DEBUG_MODE, INVOICES_FILES_PATH )
  })
  // 3- save invoices
  .then( purchases => saveInvoices(purchases) )
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
    return requestFactory({jar:true, json:false, cheerio:true})
    .get(invoicesUrl)
    .then($=>{
      if (DEBUG_MODE) {
        // then we save the invoices file for tests
        const filepath = INVOICES_FILES_PATH + 'invoices-from-puchase-' + purchase[2]
        console.log(`DEBUG : save invoices table in file : ${filepath + '.html'}`)
        require('fs').writeFileSync(filepath + '.html', $.html())
        require('fs').writeFileSync(filepath + '.url', invoicesUrl)
      }
      const invoicesList = parseInvoices($)
      return invoicesList
    })
    .mapSeries(invoiceRow => {
      const data = purchase.concat(invoiceRow)
        // Structure :
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

      const invoiceDate = moment(data[7],'DD/MM/YYYY')
      let filename = `${invoiceDate.format('YYYY-MM-DD')} - LeMonde - facture - `
      let amount   = data[5].toFixed(2) + '€'
      filename = filename + ' '.repeat(Math.max(0, 40 - filename.length - amount.length)) + amount + '.pdf'
      if (DEBUG_MODE) { // then we save the invoice for tests
        return requestFactory({jar:true, json:false, cheerio:false})
        .get({uri:invoiceRow[3], encoding: null, resolveWithFullResponse: true})
        .then(resp=>{
          const filepath = INVOICES_PDF_PATH + filename
          console.log('DEBUG : save',invoiceRow[3] + `in file : ${filepath}`)
          require('fs').writeFileSync(filepath, resp.body)
          require('fs').writeFileSync(filepath + '.url', invoiceRow[3])
        })
        .delay(500) // if too fast, the server responds a 503...
      }

      // TODO : deduplicate & save the invoice in Cozy linkBankOperations ?
      // is it better to prepare all bills and do a single saveBills ?
      const bill = {
        type      : 'media'              ,
        vendor    : 'LeMonde'            ,
        date      : invoiceDate.toDate() ,
        amount    : data[5]              ,
        currency  : 'EUR'                ,
        fileurl   : data[8]              ,
        filename  : filename
      }
      return saveBills([bill], FIELDS, {identifiers: ['monde']})
      .delay(500) // if too fast, the server responds a 503...

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
      bookmarksIndexStop  = NUMBER_OF_ARTICLES_TO_RETRIEVE
      bookmarksIndexStop  = Math.max(1,bookmarksIndexStop)
  var request = requestFactory({
    jar    : true,
    json   : true,
    cheerio: false
  })

  // a) get list of bookmarked article
  return request({
    uri: `http://www.lemonde.fr/sfuser/sfws/user/${USER_ID}/classeur/edito/${bookmarksIndexStart}/${bookmarksIndexStop}`,
  })
  .then( body => {
    const bookmarkSessions = body.articles
    let articlesList = []
    for (let key in bookmarkSessions) {
      for (let article of bookmarkSessions[key].articles){
        article.dateBookmarked = bookmarkSessions[key].dateAddedIso
      }
      articlesList = articlesList.concat(bookmarkSessions[key].articles)
    }
    if (DEBUG_MODE) {
      console.log("on écrit la liste des articles dans :", ARTICLES_LIST_PATH, '\n' + JSON.stringify(articlesList))
      require('fs').writeFile(ARTICLES_LIST_PATH,`number of articles = ${articlesList.length}\n` + JSON.stringify(articlesList), ()=>{})
    }
    // TODO : deduplicates already downloaded articles (on article.id ?)
    return articlesList;
  })

  // b) retrieve articles content
  .map(article=>{
    if (article.url !== null) {
      article.baseUrl = baseUrl
      article.url = `${baseUrl}${article.url}`
    }
    console.log('we retrieve :"' + article.url + '"');
    // // prepare the filename of the article TODO move further
    // {
    //   let dateArt = moment(article.date)
    //   dateArt = dateArt.format('YYYY-MM-DD') + ' - '
    //   article.filename = sanitizeFileName( dateArt + article.title)
    // }
    // prepare the promise to get the article content
    let getArticlePromise
    if (article.url) {
      getArticlePromise  = requestFactory({jar: true, json: false, cheerio: true})({uri: article.url})
    }else {
      // for some nUnknown reasons, article.url may equal null ... even in the web page of LeMonde, the corresponding
      // bookmarked article has no link... looks like a bug in LeMonde.
      getArticlePromise = Promise.resolve('')
    }
    return getArticlePromise

    // c) sanitize hml to get pdfDefinition
    .then( html$ => {
      article.rawHtml = html$.html()
      article.inlinedHtml = 'inlined html'
      article.html$ = html$
      article.filename = sanitizeFileName( moment(article.date).format('YYYY-MM-DD') + ' - ' + article.title)
      if (html$ === '') {
        // case when article.url is null (bug from LeMonde)
        return Promise.resolve(article)
      }else{
        return parseArticle(article)
      }
    })
    .catch(err=>{
      // sanitization went wrong
      article.pdfDefinition = null
      log('error', err.toString())
      return article
    })

    // d) save the pdf
    .then( (article) => {
      if (article.url !== null) {
        if (DEBUG_MODE) {
          /*
          Only for test : store html file in ARTICLES_HTML_PATH
          So that we can test and adjust the pdf production
          */
          let filename = ARTICLES_HTML_PATH + article.filename
          console.log('DEBUG : save article file :', filename +'.html')
          const fs = require('fs')
          fs.writeFile(filename+'.html', article.html$.html(), ()=>{})
          fs.writeFile(filename+'.url', article.url, ()=>{})
        }
        if (article.pdfDefinition !== null) {
          const stream = pdfPrinter(article.pdfDefinition)
          const fileDoc = cozyClient.files.create(stream, {
            name:article.filename + '.pdf',
            dirID:'', // TODO
            contentType:'application/pdf'
          })
          stream.end()
          return fileDoc
        }
      }
    })
    .catch(err => {
      console.log(err)
    })
    // e) save the article document and the bookmark in Cozy
    .then(fileDoc => {
      article.html$ = article.html$.html()
      article.html$ = 'article.html$.html()'
      article.fileID = fileDoc._id
      console.log("============= fileDoc");
      // console.log(fileDoc);
      delete article.pdfDefinition
      // console.log(require('json-truncate')(article,0))
      // console.log(article);
      // cozyClient.data.create('bookmark', article)
      // const bookmark = {
      //   title:
      //   bookmarkedDate:
      //   uri:
      //   localUri:
      //   note:
      //
      // }
      // // TODO est ce que l'article dans son cozy ne devrait pas être une note ? avec des méta données supplémentaires ?
      // // est ce qu'un bookmark en fait n'est pas une note de type particulier ?
      // const localArticle = {
      //   title:
      //   authors:
      //   type:
      //   localUri:
      //   note:
      //   date:
      // }
    })
  }, {concurrency:ARTICLE_DOWNLOADS_CONCURRENCY})

}



// /*****************************************
//   RETRIEVE  ACCOUNT INFORMATION
// ******************************************/
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
//     console.log($.html());
//   })



// /*****************************************
//   RETRIEVE  PERSONAL INFORMATION
// ******************************************/
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
