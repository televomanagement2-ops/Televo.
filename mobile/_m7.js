const fs = require('fs');
const path = 'C:/Users/telev/Desktop/televo/mobile/assets/images/login/anello.jpg';
// JPEG: leggo dimensioni dai marker SOF
const buf = fs.readFileSync(path);
let i = 2, W = 0, Hh = 0;
while (i < buf.length) {
  if (buf[i] !== 0xFF) { i++; continue; }
  const marker = buf[i + 1];
  if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
    Hh = buf.readUInt16BE(i + 5); W = buf.readUInt16BE(i + 7); break;
  }
  const len = buf.readUInt16BE(i + 2); i += 2 + len;
}
console.log('anello.jpg', W + 'x' + Hh, 'ratio', (W/Hh).toFixed(3));
