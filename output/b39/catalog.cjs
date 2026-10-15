const fs = require('node:fs')
const ts = require('typescript')
const configs = [
 ['src/features/v1/strings.ts','en','src/features/v1/locales/index.ts','translations','owner'],
 ['src/features/discover/strings.ts','english',null,'translated','rows'],
 ['src/features/frontdoors/strings.ts','frontEnglish',null,'rows','rows'],
 ['src/features/discover/askStrings.ts','en',null,'translations'],
 ['src/features/google/strings.ts','en',null,'translations'],
 ['src/features/shop/strings.ts','en',null,'translations'],
 ['src/features/rewards/strings.ts','en',null,'translations'],
 ['src/features/rewards/cardCopy.ts','rewardCardEnglish',null,'rewardCardTranslations'],
 ['src/features/planning/strings.ts','en',null,'planningTranslations'],
 ['src/features/sourcing/copy.ts','en',null,'copies'],
 ['src/features/google-sim/strings.ts','en',null,'simTranslations'],
 ['src/features/inquiries/Messages.tsx','en',null,'translations'],
 ['src/features/inquiries/conversationCopy.ts','conversationEnglish','src/features/inquiries/Messages.tsx','chatTranslations'],
 ['src/features/inquiries/conversationCopy.ts','conversationEnglish','src/features/public/customerLocales.ts','chatTranslations'],
 ['src/features/public/customerCopy.ts','customerEnglish','src/features/public/customerLocales.ts','customerTranslations','customer'],
 ['src/features/public/PublicShop.tsx','en',null,'publicTranslations'],
 ['src/features/v1/legal.ts','TERMS','src/features/v1/locales/legal.ts','legalTranslations','legal'],
 ['src/features/v1/legal.ts','PRIVACY',null,null,'extract'],
 ['src/features/v1/legal.ts','BIOMETRIC_NOTICE',null,null,'extract'],
]
function parse(file) { return ts.createSourceFile(file, fs.readFileSync(file,'utf8'), ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS) }
function variable(sf,name) { let result; function walk(n) { if(ts.isVariableDeclaration(n)&&n.name.getText(sf)===name) result=n.initializer; ts.forEachChild(n,walk) } walk(sf); if(!result) throw Error(name+' in '+sf.fileName); return result }
const texts=[]
function collect(n) {
 if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)) { if(!texts.includes(n.text)) texts.push(n.text); return }
 if(ts.isTemplateExpression(n)) { const text=n.head.text+n.templateSpans.map((s,i)=>'{'+i+'}'+s.literal.text).join(''); if(!texts.includes(text)) texts.push(text); return }
 if(ts.isPropertyAssignment(n)) {collect(n.initializer);return}
 if(ts.isSpreadAssignment(n)||ts.isTypeNode(n)) return
 ts.forEachChild(n,collect)
}
for(const [file,name] of configs) collect(variable(parse(file),name))
fs.writeFileSync('output/b39/english.json', JSON.stringify(texts,null,2))
if(require.main===module) console.log(texts.map((s,i)=>i+' '+s).join('\n'))
module.exports={configs,parse,variable,texts}
