'use strict'

const
  Cheerio                = require('cheerio'),
  cheerioTableparser     = require('cheerio-tableparser'),
  log                    = require('cozy-konnector-libs').log

/*
  . $ = loaded cheerio object corresponding to a web page of purchases
  . return : an array of array :
      [
        [
          0:purchase date,
          1:description,
          2:purchase number,
          3:puchase amount,
          4:invoices url
        ],
        ...
      ]
*/

module.exports = ($) => {
    // remove useless lines and prepare the table of purchases
    const table$ = Cheerio.load($.html('table'))
    table$('.achats-detail').remove()
    table$('.order-detail').remove()
    table$('.achats-labelmobile').remove()
    cheerioTableparser(table$)
    const purchasesTable = table$('table').parsetable(false,false,false)

    /* sanitize the purchase date column */
    const dateReg = /\d\d\/\d\d\/\d\d\d\d/
    for (var i = 1; i < purchasesTable[0].length; i++) {
      let purchaseDate = purchasesTable[0][i].match(dateReg)[0]
      purchasesTable[0][i] = purchaseDate
    }

    /* sanitize the description column */
    for (var i = 1; i < purchasesTable[1].length; i++) {
      purchasesTable[1][i] = Cheerio.load(purchasesTable[1][i]).text().replace(/\n/,'').trim()
    }

    /* sanitize the order number column */
    for (var i = 1; i < purchasesTable[2].length; i++) {
      purchasesTable[2][i] = Cheerio.load(purchasesTable[2][i]).text().replace(/\n/,'').trim()
    }

    /* sanitize the amount column */
    for (var i = 1; i < purchasesTable[3].length; i++) {
      let amount = Cheerio.load(purchasesTable[3][i]).text().match(/\d+[\.,]?\d*/g)[0]
      amount = parseFloat(amount.replace(/,/, '.'))
      purchasesTable[3][i] = amount
    }

    /* sanitize the invoice column */
    for (var i = 1; i < purchasesTable[4].length; i++) {
      const invoicesUrl = Cheerio.load(purchasesTable[4][i])('.itemfleche').attr('href')
      if (!invoicesUrl) {
        purchasesTable[4][i] = ''
      }else {
        purchasesTable[4][i] = invoicesUrl
      }
    }

    /* transpose rows into columns, final table structure is an array of array :
        [
          [
            0:purchase date,
            1:description,
            2:purchase number,
            3:puchase amount,
            4:invoices url
          ],
          ...
        ]
    */
    let ar = purchasesTable
    ar = ar[0].map((col, i) => ar.map(row => row[i]));

    // log('debug', 'in the end of purchase parser, purchases are :');
    // log('debug', ar);

    return ar
}
