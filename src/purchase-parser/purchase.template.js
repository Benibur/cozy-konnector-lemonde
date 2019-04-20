const path             = require('path'),
      leMondeIconePath = path.join(__dirname,'../ressources/icone-le-monde.png')

module.exports = function () {

  return {
    content: [],
    images: {
      lemondeIcone: leMondeIconePath
    },
    styles: {
      H1: {
        fontSize: 20,
        bold: true
      },
      H2: {
        fontSize: 16,
        bold: true,
        margin: [0, 25, 0, 0]
      },
      p : {
        margin: [0, 10, 0, 0],
        bold: false
      },
      description: {
        italics: true,
        color:'#555555',
        margin: [0, 40, 0, 0]
      },
      signature: {
        italics: true,
        color:'#777777',
        margin: [0, 5, 0, 0]
      },
      reference: {
        italics: true,
        color:'#777777',
        margin: [40, 10, 20, 0]
      },
      citation: {
        italics: true,
        color:'#777777',
        margin: [40, 0, 0, 0]
      },
      small: {
        fontSize: 8
      },
      // be aware that this style attributes are directly injected in the
      // content by the function "getDecoratedTextFromChildren"
      link: {
        color:'#036',
        decoration: 'underline'
      },
      SeeAlso: {
        margin: [40, 20, 0, 15],
        color:'#000',
        bold:true
      },
      fenetre: {
        margin: [40, 20, 0, 0],
        color:'#000',
        bold:false
      },
      insidefenetre: {
        margin: [40, 10, 0, 0],
        color:'#000',
        bold:false
      },
      Tweet: {
        margin: [0, 0, 0, 0],
        color:'#555555',
        decoration: 'underline'
      },
      tableHeader: {
  			margin: [0, 0, 0, 0]
  		},
      illustration:{
        alignment: 'center',
        margin:[0,5,0,5]
      },
      illustrationCaption: {
        alignment: 'center',
        color: '#555555',
        margin:[95,0,95,5],
        fontSize:10
      },
      portfolioIllustration:{
        alignment: 'center',
        margin:[0,10,0,0]    //  left, top, right, bottom
      },
      portfolioCaption: {
        alignment: 'center',
        color: '#aaaaaa',
        fontSize:10,
        margin:[90,0,90,0],
      }
    }
  }

}
