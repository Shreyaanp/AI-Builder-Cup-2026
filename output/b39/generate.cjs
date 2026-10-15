const fs = require('node:fs')
const ts = require('typescript')
const {configs,parse,variable,texts} = require('./catalog.cjs')
const locales=['hi','bn','te','mr','kn']
const data={}
for(const line of fs.readFileSync('output/b39/translations.txt','utf8').trimEnd().split('\n')) {
 const [id,...values]=line.trimEnd().split('|'); if(values.length!==5) throw Error('Bad row '+id)
 data[id]=values
}
const unchanged=new Set([29,95,180,181,184,186,187,205,247,632,846])
for(let i=0;i<texts.length;i++) if(!data[i]&&!unchanged.has(i)) throw Error('Missing '+i+' '+texts[i])
function translated(text,locale) { const id=texts.indexOf(text); if(id<0) throw Error('Unknown '+text); return data[id]?.[locales.indexOf(locale)]??text }
function render(n,sf,locale) {
 if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)) return JSON.stringify(translated(n.text,locale))
 if(ts.isTemplateExpression(n)) {
  const text=n.head.text+n.templateSpans.map((s,i)=>'{'+i+'}'+s.literal.text).join('')
  let out=translated(text,locale).replace(/[`\\]/g,'\\$&')
  out=out.replace(/\{(\d+)\}/g,(_,i)=>'${'+n.templateSpans[Number(i)].expression.getText(sf)+'}')
  return '`'+out+'`'
 }
 if(ts.isSpreadAssignment(n)) {
  const name=n.expression.getText(sf)
  if(name==='conversationEnglish') return `...chatTranslations.${locale}`
  if(name==='rewardCardEnglish') return `...rewardCardTranslations.${locale}`
  throw Error('Spread '+name)
 }
 if(ts.isIdentifier(n)&&n.text==='GRIEVANCE_CONTACT') return JSON.stringify({hi:'गोपनीयता संपर्क: सार्वजनिक लॉन्च से पहले दिया जाएगा',bn:'গোপনীয়তার যোগাযোগ: প্রকাশ্যে চালুর আগে জানানো হবে',te:'గోప్యత సంప్రదింపు: పబ్లిక్ ప్రారంభానికి ముందు తెలియజేస్తాం',mr:'गोपनीयता संपर्क: सार्वजनिक सुरुवातीपूर्वी दिला जाईल',kn:'ಗೌಪ್ಯತೆ ಸಂಪರ್ಕ: ಸಾರ್ವಜನಿಕ ಬಿಡುಗಡೆಗೆ ಮೊದಲು ತಿಳಿಸಲಾಗುತ್ತದೆ'}[locale])
 let out=n.getText(sf)
 const children=[]; ts.forEachChild(n,c=>{if(!ts.isTypeNode(c)&&!(ts.isPropertyAssignment(n)&&c===n.name)) children.push(c)})
 for(const c of children.reverse()) out=out.slice(0,c.getStart(sf)-n.getStart(sf))+render(c,sf,locale)+out.slice(c.end-n.getStart(sf))
 return out
}
for(const [source,name,target,registry,kind] of configs) {
 if(kind==='extract') continue
 const existing=variable(parse(target??source),registry)
 if(existing.properties?.some(p=>p.name?.getText()==='hi')) continue
 const sf=parse(source), value=variable(sf,name)
 const file=target??source
 if(kind==='owner') {
  let index=fs.readFileSync(file,'utf8')
  for(const locale of locales) {
   const object=render(value,sf,locale)
   fs.writeFileSync(`src/features/v1/locales/${locale}.ts`,`import type { Copy } from '../strings'\n\nexport const ${locale}: Copy = ${object}\n`)
   index=`import { ${locale} } from './${locale}'\n`+index
  }
  const dest=parse(file), obj=variable(dest,registry)
  // Reparse after adding imports so offsets correspond to the updated file.
  fs.writeFileSync(file,index.replace(/(export const translations[^=]*= \{)/, '$1\n'+locales.map(l=>`  ${l},`).join('\n')))
  continue
 }
 let additions=locales.map(locale=>{
  let object
  if(kind==='rows') object='['+value.properties.map(p=>render(p.initializer,sf,locale)).join(',\n')+']'
  else if(kind==='legal') object='{'+['TERMS','PRIVACY','BIOMETRIC_NOTICE'].map(k=>k+':'+render(variable(sf,k),sf,locale)).join(',\n')+'}'
  else if(registry==='publicTranslations') object='{'+value.properties.filter(p=>!ts.isSpreadAssignment(p)).map(p=>render(p,sf,locale)).join(',\n')+'}'
  else object=render(value,sf,locale)
  return `${locale}: ${object},`
 }).join('\n')
 const dest=parse(file), obj=variable(dest,registry)
 const text=dest.text, start=obj.getStart(dest)+1
 fs.writeFileSync(file,text.slice(0,start)+'\n'+additions+'\n'+text.slice(start))
}
console.log('Generated complete copy for',locales.join(', '))
