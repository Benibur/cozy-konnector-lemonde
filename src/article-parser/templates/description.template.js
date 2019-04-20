module.exports = function () {

  return {
    style: 'tableHeader',
    table: {
      widths: ['*', 100],
      body: [
        [
          {
            // border: [true, true, true, true],
            text:'Une description'
          },
          {
            // border: [true, true, true, true],
            image:'',
            width: 100,
            rowSpan:2
          }
        ],[
          {
            // border: [true, true, true, true],
            text:'Une signature',
            style: 'signature'
          }
        ],
      ]
    },
    layout: {
      defaultBorder: false,
    },
    margin: [0, 40, 0, 0] // right, top, left, bottom
  }

}
