const fs = require('fs');
const path = require('path');
const walk = dir => fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : [path.join(dir,e.name)]);
const files = ['app','components'].flatMap(walk).filter(f=>f.endsWith('.tsx'));
const neutral = (kind, level) => {
  level=Number(level);
  if(kind==='text') return level >= 700 ? 100 : level >= 500 ? 400 : level;
  if(kind==='bg') return level <= 50 ? 900 : level <= 300 ? 800 : level <= 600 ? 700 : level;
  if(kind==='border'||kind==='divide'||kind==='ring') return level < 500 ? 800 : 600;
  return level;
};
const hex = {
 '#ef233c':'#3f3f46','#ff4056':'#52525b','#ff6b7d':'#e4e4e7','#ff5367':'#e4e4e7','#d71934':'#3f3f46',
 '#2a3039':'#27272a','#343c47':'#3f3f46','#12151a':'#18181b','#101319':'#09090b','#181c22':'#27272a','#20252d':'#3f3f46',
 '#0b0d10':'#09090b','#0d0d0f':'#09090b','#f4f7fa':'#fafafa','#a7b1bc':'#a1a1aa','#aeb4bf':'#a1a1aa','#8f9aa8':'#a1a1aa',
 '#c7d0d9':'#d4d4d8','#9ca8b8':'#a1a1aa','#b8c2ce':'#d4d4d8','#26303d':'#27272a','#343f4d':'#3f3f46',
 '#37d7ff':'#d4d4d8','#58defe':'#e4e4e7','#12303a':'#27272a','#49d17d':'#34d399',
};
for(const file of files){
 let s=fs.readFileSync(file,'utf8');
 s=s.replace(/\b(text|bg|border|divide|ring)-(slate|gray)-(50|100|200|300|400|500|600|700|800|900|950)\b/g,(_,kind,color,level)=>`${kind}-zinc-${neutral(kind,level)}`);
 s=s.replace(/\b(text|bg|border|ring)-(cyan|sky|blue|indigo|violet|purple)-(50|100|200|300|400|500|600|700|800|900|950)\b/g,(_,kind,color,level)=>`${kind}-zinc-${kind==='text' ? 300 : kind==='bg' ? (Number(level)<400?800:700) : 600}`);
 s=s.replace(/\bbg-white(?=[\s/"'`])/g,'bg-zinc-900').replace(/\bborder-white\/(?:70|60|50)/g,'border-zinc-800');
 for(const [old,color] of Object.entries(hex)) s=s.replaceAll(old,color);
 s=s.replaceAll('noir-shimmer-button','shimmer-btn');
 s=s.replace(/shadow-\[0_[^\]]+\]/g,'shadow-xl');
 fs.writeFileSync(file,s);
}
let layout=fs.readFileSync('app/layout.tsx','utf8');
layout=layout.replace(/import '@fontsource\/(?:space-grotesk|orbitron)\/\d+\.css';\r?\n/g,'');
layout=layout.replace("import './globals.css';", "import './globals.css';\nimport '@fontsource/manrope/400.css';\nimport '@fontsource/manrope/500.css';\nimport '@fontsource/manrope/600.css';\nimport '@fontsource/manrope/700.css';\nimport '@fontsource/manrope/800.css';");
layout=layout.replace('<html lang="en">','<html lang="en" className="dark">').replace('<body>','<body>\n        <div className="noise-overlay" aria-hidden="true" />');
fs.writeFileSync('app/layout.tsx',layout);
const ts=JSON.parse(fs.readFileSync('tsconfig.json','utf8'));ts.exclude=[...new Set([...ts.exclude,'v0-reference'])];fs.writeFileSync('tsconfig.json',JSON.stringify(ts,null,2)+'\n');
