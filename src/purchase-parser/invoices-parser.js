'use strict'

const Cheerio = require('cheerio'),
  cheerioTableparser = require('cheerio-tableparser')

/*
    . $ = loaded cheerio object corresponding to a web page of invoices
    . return : an array of array :
        [
          [0:invoice amount,
          1:payment mean,
          2:invoice date,
          3:invoices url
          4:invoice id],
          ...
        ]
  */

module.exports = invoicesBody$ => {
  cheerioTableparser(invoicesBody$)
  const invoicesTable = invoicesBody$('table').parsetable(false, false, false)

  // sanitize amount coloumn
  for (let i = 1; i < invoicesTable[0].length; i++) {
    let invoiceCell = invoicesTable[0][i]
    invoiceCell = Cheerio('<div>' + invoiceCell + '</div>')
    let amount = invoiceCell.text().match(/\d+[.,]?\d*/g)[0]
    amount = parseFloat(amount.replace(/,/, '.'))
    invoicesTable[0][i] = amount
  }

  // sanitize payment mean
  for (let i = 1; i < invoicesTable[1].length; i++) {
    let invoiceCell = invoicesTable[1][i]
    invoiceCell = Cheerio('<div>' + invoiceCell + '</div>')
    invoicesTable[1][i] = invoiceCell
      .text()
      .replace(/\\n/, '')
      .trim()
  }

  // sanitize date
  for (let i = 1; i < invoicesTable[2].length; i++) {
    let invoiceCell = invoicesTable[2][i]
    invoiceCell = Cheerio('<div>' + invoiceCell + '</div>')
    invoicesTable[2][i] = invoiceCell
      .text()
      .replace(/\\n/, '')
      .trim()
  }

  // sanitize column with invoice pdf link
  for (let i = 1; i < invoicesTable[3].length; i++) {
    let invoiceCell = invoicesTable[3][i]
    invoiceCell = Cheerio('<div>' + invoiceCell + '</div>')
    const url = invoiceCell.find('a').attr('href')
    invoicesTable[3][i] = url
  }

  // transpose the table
  let ar = invoicesTable
  ar = ar[0].map((col, i) => ar.map(row => row[i]))
  // remove first row :
  ar.shift()

  // row structure :
  // 0 [ '10€',
  // 1  'Prélèvement carte bancaire',
  // 2  '28/12/2017',
  // 3  'https://moncompte.lemonde.fr/gsales/order/pdf/id/1585973349/'
  return ar
}
