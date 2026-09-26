// Deterministic export of the supplied Xinpianchang SVG and exact ranking labels.
// NODE_PATH must expose sharp; no generated/redrawn logo or low-resolution crop.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const dir = path.resolve(__dirname, '../assets/images/projects/alone');
const source = fs.readFileSync(path.join(dir, 'rank-staff-picks.11717261.svg'), 'utf8');
const mark = Buffer.from(source).toString('base64');
const labels = ['2023 · 第35期 · 精选周榜', '2023 · 第34期 · 精选周榜'];
function artwork(stacked) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${stacked ? 1920 : 3840}" height="${stacked ? 640 : 320}" viewBox="0 0 ${stacked ? '696 232' : '1440 120'}">
  <title>新片场精选周榜：2023年第35期、2023年第34期</title>
  ${labels.map((label, i) => `<g transform="translate(${stacked ? 0 : i * 744} ${stacked ? i * 112 : 0})">
    <image x="14" y="24" width="72" height="72" xlink:href="data:image/svg+xml;base64,${mark}"/>
    <text x="108" y="75" fill="#d6b77a" font-family="Arial, Heiti SC, sans-serif" font-size="40" font-weight="400">${label}</text>
  </g>`).join('\n')}
</svg>`;
}
Promise.all([false, true].map(stacked => sharp(Buffer.from(artwork(stacked)))
  .png({compressionLevel:9})
  .toFile(path.join(dir, `alone-staff-picks-2023-${stacked ? 'mobile' : '3840'}.png`))))
  .then(info => console.log(JSON.stringify(info)))
  .catch(error => { console.error(error); process.exitCode = 1; });
