'use strict'

const PdfPrinter = require('pdfmake'),
  path = require('path')

let printer

// create a font-declaration object pointing to font files
var fonts = {
  Roboto: {
    normal: path.join(__dirname, './ressources/fonts/Roboto-Regular.ttf'),
    bold: path.join(__dirname, './ressources/fonts/Roboto-Medium.ttf'),
    italics: path.join(__dirname, './ressources/fonts/Roboto-Italic.ttf'),
    bolditalics: path.join(
      __dirname,
      './ressources/fonts/Roboto-MediumItalic.ttf'
    )
  }
}

// create a PdfPrinter object
printer = new PdfPrinter(fonts)

module.exports = function createPDF(pdfDefinition) {
  let pdfDoc = printer.createPdfKitDocument(pdfDefinition)
  // pdfDoc is a stream
  return pdfDoc
}
