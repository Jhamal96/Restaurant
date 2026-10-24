import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Build the single-file Worker using the same public files used by the PWA.
// No API keys are bundled into these browser-visible assets.
const types = {
  'index.html':'text/html; charset=utf-8',
  'app.js':'application/javascript; charset=utf-8',
  'install-state.js':'application/javascript; charset=utf-8',
  'icon.svg':'image/svg+xml',
  'manifest.webmanifest':'application/manifest+json',
  'sw.js':'application/javascript; charset=utf-8',
  'download.html':'text/html; charset=utf-8'
};
const files={};
for (const [name,type] of Object.entries(types)) {
  files['/'+name]={content:readFileSync(resolve(name),'utf8'),type};
}
const input=readFileSync(resolve('worker.js'),'utf8');
const token='const STATIC_FILES = {};';
if(!input.includes(token))throw new Error('Unable to find Worker asset placeholder');
const result=input.replace(token,'const STATIC_FILES = '+JSON.stringify(files)+';');
mkdirSync(resolve('.generated'),{recursive:true});
writeFileSync(resolve('.generated/nibblespot.mjs'),result);
console.log('Prepared NibbleSpot Worker with '+Object.keys(files).length+' app assets.');
