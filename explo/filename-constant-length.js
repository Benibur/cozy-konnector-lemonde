let filename = `2019-09-02 - LeMonde - facture - `
let amount = 12.5
amount = amount.toFixed(2) + '€'
filename =
  filename +
  ' '.repeat(Math.max(0, 4 - filename.length - amount.length)) +
  amount +
  '.pdf'
console.log(filename)
