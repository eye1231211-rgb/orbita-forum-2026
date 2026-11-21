import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const source=process.argv[2];
if(!source)throw new Error('Provide the generated-image directory');
const destination=resolve('public/images');
await mkdir(destination,{recursive:true});
const images=[
 ['campus','exec-e4bf49c1-dd86-4077-a6aa-601709be4a2f.png',1440],
 ['documents','exec-7692e62c-58ba-4cfb-b7e4-91ffd8b52a78.png',640],
 ['calendar','exec-a77de376-edda-4d96-afc8-2dba12b9a039.png',640],
 ['books','exec-fff146b3-b5ba-4b32-8f06-3d36e6d4cc25.png',640],
];
// Delivery encoding only. Keep the generated composition and alpha intact.
for(const [name,file,width] of images){
 const result=await sharp(resolve(source,file)).resize({width,withoutEnlargement:true}).webp({quality:88,alphaQuality:100}).toFile(resolve(destination,`${name}.webp`));
 console.log(`${name}: ${result.width}x${result.height}, ${result.size} bytes`);
}
