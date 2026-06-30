const fs = require('fs');
const buf = fs.readFileSync('C:/Users/telev/Desktop/televo/mobile/assets/images/login/unnamed.jpg');
let i = 2, W = 0, Hh = 0;
while (i < buf.length) {
  if (buf[i] !== 0xFF) { i++; continue; }
  const m = buf[i + 1];
  if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) { Hh = buf.readUInt16BE(i + 5); W = buf.readUInt16BE(i + 7); break; }
  i += 2 + buf.readUInt16BE(i + 2);
}
console.log('unnamed.jpg', W + 'x' + Hh, 'ratio W/H', (W / Hh).toFixed(3));
