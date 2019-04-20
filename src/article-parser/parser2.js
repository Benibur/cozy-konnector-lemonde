/*
  GLOBALS
 */

const inline  = require('web-resource-inliner')
const path    = require('path')
const $       = require('cheerio')
const Promise = require('bluebird')
inlineHtml    = Promise.promisify(inline.html)


/*
  MAIN :
  . expects article {html$, baseUrl, url}
    . html$   : the html Cheerio Object
    . baseUrl : a string containing the url to turn relative links into absolute urls
    . url : {string} absolute url to the article
  . return : a promise returning the article augmented with {inlinedHtml}
*/

/*
  TODO
  . manage embeded video, exemple : http://abonnes.lemonde.fr/sport/article/2018/01/25/jusqu-ou-iront-les-retombees-du-scandale-d-abus-sexuels-apres-la-condamnation-de-larry-nassar_5247189_3242.html
  . manage embeded gephy: exemple : http://abonnes.lemonde.fr/sport/article/2018/01/25/jusqu-ou-iront-les-retombees-du-scandale-d-abus-sexuels-apres-la-condamnation-de-larry-nassar_5247189_3242.html
*/

module.exports = (article)=>{
  // remove some elements
  const SELECTORS_TO_REMOVE = ['#cookie-banner',  '.aside__iso', '.old__aside', '.Nav', '#jelec_link.Header__jelec', '.Header__actions', '.meta.meta__social', 'section.area', 'section.footer__main', 'section.footer__bottom', '#header-page', '#nav.conteneur-nav', '.super_global > .colonnette', '#footer-page.univers-sombre']
  const art$ = article.html$('html')
  SELECTORS_TO_REMOVE.forEach(sel => art$.find(sel).remove() )

  // remove background for pages such as lemonde blogs: http://abonnes.lemonde.fr/big-browser/article/2019/03/28/aux-etats-unis-des-centaines-de-villes-croulant-sous-leurs-dechets-ne-recyclent-plus_5442790_4832693.html
  art$.find('.super_global.clearfix').attr('style', 'background: none;')

  // add video iframes
  // TODO : retrieve video content ??
  let videos$ = art$.find('.js_player')
  videos$.each((i, el) =>{
    let el$ = $(el)
    let videoId = el$.prop('data-id')
    let provider = el$.prop('data-provider')
    if (provider==='youtube') {
      videoId = videoId.replace(/player-/,'')
      el$.append(`<iframe data-provider="youtube" data-title="${el$.prop('data-title')}" allowfullscreen="1" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" title="YouTube video player" class="js_player" src="https://www.youtube.com/embed/${videoId}?autoplay=0&enablejsapi=1&origin=https%3A%2F%2Fwww.lemonde.fr&widgetid=1"></iframe>`)
    }else if (provider==='digiteka') {
      el$.append(`<iframe src="https://www.ultimedia.com/deliver/generic/iframe/src/${videoId}/"></iframe>`)
    }
  })

  // TODO : optional :
  // 1/ retrieve the "Dans la même rubrique" suggestions
  // 2/ récupérer les graphes (impose d'avoir un headless...) ex: https://www.lemonde.fr/les-decodeurs/article/2018/02/15/etats-unis-depuis-le-debut-de-l-annee-pas-plus-de-deux-jours-sans-victime-dans-des-fusillades-de-masse_5257522_4355770.html

  // inline assets in the html
  let baseUrl = path.dirname(article.url)
  return inlineHtml( {
    fileContent: article.html$.html() ,
    relativeTo : baseUrl              ,
    images     : true                 ,
    scripts    : false                ,

  })
  .then( (inlined, err)=>{
    article.inlinedHtml = inlined
    return article
  })
}
