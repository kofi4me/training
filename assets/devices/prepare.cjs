const sharp = require(process.argv[2]);
const path = require('node:path');
(async () => {
  for (const name of ['router', 'switch', 'host']) {
    const input = path.join(__dirname, name + '.png');
    const metadata = await sharp(input).metadata();
    await sharp(input).trim().resize({ width: 480, height: 320, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toFile(path.join(__dirname, name + '.webp'));
    console.log(name, 'alpha:', metadata.hasAlpha);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
