'use strict'

const Signature = require('./signature')

const sts = [
  'TAG.class1.class2#id',
  '.class1.class2#id',
  'TAG#id',
  'TAG',
  '',
  '.C1',
  '#id1',
  '.c1#id1'
]

let sign, att

for (let st of sts) {
  console.log('\nstring :', st);
  const sign = new Signature(st)
  console.log('result :', sign.toString())
}

console.log('equality tets');
sign = new Signature(sts[0]),
att = '.class1'

console.log('\ndoes     :', sts[0], '\ncontains :', att, '\n =>', sign.contains(att));


sign = new Signature(sts[0])
att = ''
console.log('\ndoes     :', sts[0], '\ncontains :', att, '\n =>', sign.contains(att));

sign = new Signature(sts[0])
att = 'TAG#ids'
console.log('\ndoes     :', sts[0], '\ncontains :', att, '\n =>', sign.contains(att));

sign = new Signature(sts[0])
att = 'TAG'
console.log('\ndoes     :', sts[0], '\ncontains :', att, '\n =>', sign.contains(att));

sign = new Signature('DIV.multimedia-embed.snippet')
att = 'DIV.multimedia-embed.snippet'
console.log('\ndoes     :', 'DIV.multimedia-embed.snippet', '\ncontains :', att, '\n =>', sign.contains(att));
