import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const sharp = createRequire(import.meta.url)(process.argv[2] || 'sharp');
const source = await readFile(new URL('../icons/icon.svg',import.meta.url));
for (const [name,size] of [['icon-192.png',192],['icon-512.png',512],['icon-maskable.png',512],['apple-touch-icon.png',180]]) {
  await sharp(source).resize(size,size).flatten({background:'#f2f5f7'}).png().toFile(new URL('../icons/'+name,import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
}
console.log('Generated four local PWA icons.');
