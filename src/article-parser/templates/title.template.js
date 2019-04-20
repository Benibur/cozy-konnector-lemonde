module.exports = function () {
  return {
    style: 'tableHeader',
    table: {
      widths: [50, '*'],
      body: [
        [
          {
            image:'lemondeIcone',
            width: 50
          },
          {
            style: 'H1',
            text:''
          }
        ]
      ]
    },
    layout: {
      defaultBorder: false,
    }
  }
}
