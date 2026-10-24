'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const sharp=require('sharp');
async function run(){
  const svg=await fs.readFile(path.join(__dirname,'brand-icon.svg'));
  await sharp(svg).resize(1024,1024).png().toFile(path.join(__dirname,'icon.png'));
  console.log('Created NibbleSpot desktop icon 1024x1024');
}
run().catch(err=>{console.error(err);process.exitCode=1});
