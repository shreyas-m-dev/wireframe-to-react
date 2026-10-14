'use strict';

const DEFAULT_ROW_OVERLAP_THRESHOLD = 0.5;
const STRUCTURAL_ROLES = new Set(['page', 'header', 'nav', 'main', 'footer', 'gallery', 'product-area', 'product-detail', 'related-products', 'sidebar', 'section', 'nav-group', 'product-card-grid', 'thumbnail-gallery', 'hero-section', 'services-section', 'feature-card-grid', 'feature-card', 'split-content-section', 'media-text-column', 'text-media-column', 'about-section', 'contact-section', 'form', 'map-region', 'media-region', 'repeated-region']);
let idCounter = 0;
const nodeArea = (node) => node.bbox.width * node.bbox.height;
function nextId(type) { idCounter += 1; return `${type}-${idCounter}`; }
function verticallyOverlaps(a, b, threshold = DEFAULT_ROW_OVERLAP_THRESHOLD) { const overlap = Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y); return overlap > 0 && overlap / Math.min(a.height,b.height) >= threshold; }
function groupIntoRows(elements, threshold = DEFAULT_ROW_OVERLAP_THRESHOLD) { const rows=[]; for(const el of [...elements].sort((a,b)=>a.y-b.y)){const row=rows.find(r=>r.some(other=>verticallyOverlaps(other,el,threshold)));(row||rows[rows.push([])-1]).push(el);} return rows; }
function sortRowsByX(rows) { return rows.map(row=>[...row].sort((a,b)=>a.x-b.x)); }
function isContainedIn(child,parent,tolerance=4) { const c=child.bbox||child,p=parent.bbox||parent; return c.x>=p.x-tolerance&&c.y>=p.y-tolerance&&c.x+c.width<=p.x+p.width+tolerance&&c.y+c.height<=p.y+p.height+tolerance&&!(c.x===p.x&&c.y===p.y&&c.width===p.width&&c.height===p.height); }
function makeNode(element,bounds) { const bbox={x:element.x,y:element.y,width:element.width,height:element.height}; const bboxNorm={x:+((bbox.x-bounds.x)/bounds.width).toFixed(4),y:+((bbox.y-bounds.y)/bounds.height).toFixed(4),width:+(bbox.width/bounds.width).toFixed(4),height:+(bbox.height/bounds.height).toFixed(4)}; const confidence=element.confidence??.5; const sources=new Set(element.sources||[]); const vision=Boolean(element.visionEvidence||sources.has('vision')); const cv=Boolean(sources.has('cv')||!vision); return {type:element.type||'region',id:element.canonicalId||nextId(element.type||'region'),role:element.role||'region',confidence,roleConfidence:confidence,text:element.label??element.text??null,textConfidence:element.ocrEvidence?.confidence ? element.ocrEvidence.confidence/100 : null,bbox,bboxPx:bbox,bboxNorm,position:{x:bbox.x,y:bbox.y},size:{width:bbox.width,height:bbox.height},relativeBounds:bboxNorm,label:element.label??element.text??null,parentId:null,parentRole:null,readingOrder:null,ocr:element.ocrGroup?{...element.ocrGroup,sourceBounds:bbox,normalizedBounds:bboxNorm}:null,layout:{direction:element.layoutHint?.direction||'auto',columns:element.layoutHint?.columns||1,gap:element.layoutHint?.gap||0,align:element.layoutHint?.align||'start',repeated:false},styleHints:element.styleHints||{},repeatInfo:null,evidence:{source:vision&&cv?'vision+cv':vision?'vision-adapter':element.role?'macro-layout-pass':'component-pass',grouping:element.role?`macro ${element.role}`:'contour/OCR candidate',vision:element.visionEvidence||null},uncertainty:Math.round((1-confidence)*100)/100,source:{cv,ocr:Boolean(element.ocrEvidence||element.ocrGroup),vision,merged:vision&&cv},children:[]}; }
function inferLayout(node) { const c=node.children||[];if(c.length<2)return{direction:'auto',columns:1,gap:0,align:'start',repeated:false};const xs=c.map(n=>n.bbox.x),ys=c.map(n=>n.bbox.y),ws=c.map(n=>n.bbox.width),hs=c.map(n=>n.bbox.height);const row=Math.max(...ys)-Math.min(...ys)<=Math.max(...hs)*.55,col=Math.max(...xs)-Math.min(...xs)<=Math.max(...ws)*.55,same=Math.max(...ws)-Math.min(...ws)<=Math.max(...ws)*.18&&Math.max(...hs)-Math.min(...hs)<=Math.max(...hs)*.18;const direction=row?'row':col?'column':'grid';return{direction,columns:direction==='grid'?Math.max(2,Math.min(4,Math.round(Math.sqrt(c.length)))):1,gap:12,align:row?'center':'stretch',repeated:same&&c.length>=3}; }
function smallestContaining(node,candidates,root) { return candidates.filter(c=>c!==node&&isContainedIn(node,c)).sort((a,b)=>nodeArea(a)-nodeArea(b))[0]||root; }
function leafRole(node) { if(node.role)return node.role;if(node.type==='image')return'media';if(node.type==='input')return node.parentRole==='header'?'search':'field';if(node.type==='button')return node.parentRole==='product-detail'?'primary-action':node.parentRole==='header'?'nav-action':'action';if(node.type==='text')return node.parentRole==='product-detail'?'product-copy':'copy';return null; }

const LANDING_SECTION_ROLES = new Set(['hero-section','services-section','split-content-section','about-section','contact-section']);
const labelOf = node => String(node.label || node.text || '').trim();
const normalText = value => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const centreY = node => node.bbox.y + node.bbox.height / 2;
const overlapsY = (a,b) => Math.max(0, Math.min(a.bbox.y+a.bbox.height,b.bbox.y+b.bbox.height)-Math.max(a.bbox.y,b.bbox.y));
function hasLandingEvidence(nodes) {
  const labels=nodes.map(node=>normalText(labelOf(node)));
  const roles=new Set(nodes.map(node=>node.role));
  return roles.has('hero-section') || roles.has('services-section') || (labels.some(text=>text.includes('services')) && labels.some(text=>text.includes('about') || text.includes('contact')));
}
function chooseOne(nodes, role) { return nodes.filter(node=>node.role===role).sort((a,b)=>b.confidence-a.confidence || nodeArea(b)-nodeArea(a))[0] || null; }
function setParent(node,parent,reason,log) { const old=node.parentId; node.parentId=parent.id; node.parentRole=parent.role; parent.children.push(node); if(old!==parent.id) log.push({nodeId:node.id,oldParentId:old||null,newParentId:parent.id,reason,evidence:[node.role,labelOf(node)].filter(Boolean)}); }
function makeSynthetic(role, bounds, parent, reason) { const node={type:'region',id:nextId('region'),role,confidence:.7,roleConfidence:.7,text:null,label:null,bbox:bounds,bboxPx:bounds,bboxNorm:parent?.bboxNorm||{x:0,y:0,width:1,height:1},position:{x:bounds.x,y:bounds.y},size:{width:bounds.width,height:bounds.height},relativeBounds:{x:0,y:0,width:1,height:1},parentId:null,parentRole:null,readingOrder:null,layout:{direction:'column',columns:1,gap:12,align:'stretch',repeated:false},styleHints:{},repeatInfo:null,evidence:{source:'canonical-section-reconstruction',grouping:reason,vision:null},uncertainty:.3,source:{cv:true,ocr:false,vision:false,merged:false},children:[]}; return node; }
function canonicalizeLanding(root, nodes, bounds) {
  if(!hasLandingEvidence(nodes)) return null;
  const decisions=[];
  const page=chooseOne(nodes,'page') || makeSynthetic('page',bounds,null,'page bounds');
  const header=chooseOne(nodes,'header') || makeSynthetic('header',{x:bounds.x,y:bounds.y,width:bounds.width,height:Math.max(1,bounds.height*.12)},page,'top band');
  const main=chooseOne(nodes,'main') || makeSynthetic('main',{x:bounds.x,y:header.bbox.y+header.bbox.height,width:bounds.width,height:Math.max(1,bounds.height-header.bbox.height)},page,'remaining page band');
  const footer=chooseOne(nodes,'footer');
  const sectionByRole={};
  for(const role of LANDING_SECTION_ROLES) { const found=chooseOne(nodes,role); if(found) sectionByRole[role]=found; }
  // Oversized CV rectangles are scaffolding, never a landing media section,
  // when they cross independently anchored hero/services bands.
  const media=nodes.filter(node=>node.role==='media-region');
  for(const candidate of media) {
    const crosses=Object.values(sectionByRole).filter(section=>overlapsY(candidate,section)>0).length;
    if(crosses>=2 || candidate.bbox.height > main.bbox.height*.55) { candidate.role='region'; candidate.evidence={...candidate.evidence,grouping:'demoted oversized multi-band CV region'}; decisions.push({nodeId:candidate.id,oldParentId:null,newParentId:main.id,reason:'demoted oversized multi-band media candidate',evidence:['crosses-section-bands']}); }
  }
  const textNodes=nodes.filter(node=>node.type==='text');
  const byText=(pattern)=>textNodes.filter(node=>pattern.test(normalText(labelOf(node))));
  const hero=sectionByRole['hero-section'] || (byText(/headline/)[0] ? makeSynthetic('hero-section',{x:bounds.x,y:header.bbox.y+header.bbox.height,width:bounds.width,height:bounds.height*.2},main,'hero heading anchor') : null);
  const services=sectionByRole['services-section'] || (byText(/services/)[0] ? makeSynthetic('services-section',{x:bounds.x,y:bounds.y+bounds.height*.3,width:bounds.width,height:bounds.height*.25},main,'services heading anchor') : null);
  const about=sectionByRole['about-section'] || (byText(/about/)[0] ? makeSynthetic('about-section',{x:bounds.x,y:bounds.y+bounds.height*.6,width:bounds.width,height:bounds.height*.18},main,'about heading anchor') : null);
  const contact=sectionByRole['contact-section'] || (byText(/contact us/)[0] ? makeSynthetic('contact-section',{x:bounds.x,y:bounds.y+bounds.height*.8,width:bounds.width,height:bounds.height*.16},main,'contact heading anchor') : null);
  const split=sectionByRole['split-content-section'];
  const all=[...nodes]; if(!nodes.includes(page)) all.push(page); if(!nodes.includes(header)) all.push(header); if(!nodes.includes(main)) all.push(main); for(const section of [hero,services,split,about,contact,footer]) if(section&&!all.includes(section)) all.push(section);
  all.forEach(node=>{node.children=[];node.parentId=null;node.parentRole=null;}); root.children=[]; setParent(page,root,'single page root',decisions); setParent(header,page,'top page band',decisions); setParent(main,page,'main page band',decisions); if(footer) setParent(footer,page,'bottom page band',decisions);
  const sections=[hero,services,split,about,contact].filter(Boolean).sort((a,b)=>a.bbox.y-b.bbox.y); sections.forEach(section=>setParent(section,main,'canonical macro band',decisions));
  const nav=chooseOne(nodes,'nav-group') || makeSynthetic('nav-group',{x:header.bbox.x+header.bbox.width*.25,y:header.bbox.y,width:header.bbox.width*.5,height:header.bbox.height},header,'header links'); if(!all.includes(nav)) all.push(nav); setParent(nav,header,'single header navigation',decisions);
  const sectionFor = node => {
    if(node===page||node===header||node===main||node===footer||node===nav||sections.includes(node)) return null;
    const text=normalText(labelOf(node));
    if(/logo/.test(text)) return header;
    if(node.role==='nav-link' || (centreY(node)<=header.bbox.y+header.bbox.height*1.1 && node.type==='text')) return nav;
    if(centreY(node)<=header.bbox.y+header.bbox.height*1.1) return header;
    if(hero && (node.role==='hero-heading'||/headline|get started/.test(text)||node.bbox.y<=hero.bbox.y+hero.bbox.height)) return hero;
    // Specific heading and control anchors must win over an oversized section
    // candidate whose CV box happens to cross later source bands.
    if(contact && (/contact us|send/.test(text)||node.type==='input'||(node.bbox.y>=contact.bbox.y-0.05&&centreY(node)<=contact.bbox.y+contact.bbox.height))) return contact;
    if(about && (/about/.test(text)||node.role==='map-region'||(node.bbox.y>=about.bbox.y-0.05&&centreY(node)<=about.bbox.y+about.bbox.height))) return about;
    if(services && (/services/.test(text)||node.role==='feature-card'||node.role==='feature-card-grid'||(node.bbox.y>=services.bbox.y-0.05&&centreY(node)<=services.bbox.y+services.bbox.height))) return services;
    return main;
  };
  for(const node of all) { const parent=sectionFor(node); if(parent) setParent(node,parent,'geometry, heading anchor, role compatibility',decisions); }
  // Move logo out of nav; keep CTA separate from the CONTACT navigation link.
  const logos=header.children.filter(child=>/logo/.test(normalText(labelOf(child)))).sort((a,b)=>a.bbox.x-b.bbox.x);
  logos.forEach((logo,index)=>{ logo.role='logo'; if(index>0) { header.children=header.children.filter(node=>node!==logo); decisions.push({nodeId:logo.id,oldParentId:header.id,newParentId:null,reason:'duplicate logo OCR candidate',evidence:['same header band','same label']}); } });
  for(const child of [...nav.children]) if(/logo/.test(normalText(labelOf(child)))) { nav.children=nav.children.filter(node=>node!==child); setParent(child,header,'logo is a header child, not navigation',decisions); child.role='logo'; }
  header.children = header.children.filter(child => !(child.type === 'input' && child.bbox.width > bounds.width * 0.5));
  if(contact) for(const child of contact.children) { const text=normalText(labelOf(child)); if(/contact us/.test(text)) { child.type='text'; child.role='section-heading'; } if(/send/.test(text)) child.role='submit-action'; }
  // Thumbnail roles are ecommerce-specific. A landing page needs independent
  // repeated thumbnail evidence before retaining them; local CV fragments are
  // discarded rather than transformed into a gallery.
  for(const node of [...all]) if(['thumbnail-image','media-thumbnail-strip','thumbnail-gallery'].includes(node.role) && !node.source?.vision) { const parent=node.parentId&&all.find(candidate=>candidate.id===node.parentId); if(parent) parent.children=parent.children.filter(child=>child!==node); decisions.push({nodeId:node.id,oldParentId:node.parentId,newParentId:null,reason:'unsupported local thumbnail role on landing',evidence:['landing category filter']}); }
  // A contact input plus SEND action is concrete evidence for one form wrapper.
  if(contact) { const input=contact.children.find(node=>node.type==='input'); const send=contact.children.find(node=>/send/.test(normalText(labelOf(node)))); if(input&&send) { const form=chooseOne(nodes,'form') || makeSynthetic('form',{x:Math.min(input.bbox.x,send.bbox.x),y:Math.min(input.bbox.y,send.bbox.y),width:Math.max(input.bbox.x+input.bbox.width,send.bbox.x+send.bbox.width)-Math.min(input.bbox.x,send.bbox.x),height:Math.max(input.bbox.y+input.bbox.height,send.bbox.y+send.bbox.height)-Math.min(input.bbox.y,send.bbox.y)},contact,'input and submit evidence'); if(!all.includes(form)) {all.push(form);setParent(form,contact,'synthesized contact form',decisions);} for(const child of [input,send]) {contact.children=contact.children.filter(node=>node!==child);setParent(child,form,'input/submit belong to contact form',decisions);} send.role='submit-action'; 
for (const child of [...contact.children]) { if (/send/.test(normalText(labelOf(child)))) { contact.children = contact.children.filter(node=>node!==child); decisions.push({nodeId:child.id,oldParentId:contact.id,newParentId:null,reason:'duplicate send button'}); } }
} }
  // Repeated, aligned containers in the services band become one grid.
  if(services) {
    const allCards=services.children.filter(node=>node.type==='container'||node.role==='feature-card'||node.type==='card'||node.type==='region'||node.type==='media'||node.type==='image').filter(node=>node.bbox.width>bounds.width*.12&&node.bbox.width<bounds.width*.45);
    if(allCards.length>=2) {
      const minY = Math.min(...allCards.map(c=>c.bbox.y));
      const cards = allCards.filter(c => Math.abs(c.bbox.y - minY) < bounds.height * 0.08);
      if(cards.length>=2) {
        const grid=chooseOne(nodes,'feature-card-grid') || makeSynthetic('feature-card-grid',{x:Math.min(...cards.map(node=>node.bbox.x)),y:Math.min(...cards.map(node=>node.bbox.y)),width:Math.max(...cards.map(node=>node.bbox.x+node.bbox.width))-Math.min(...cards.map(node=>node.bbox.x)),height:Math.max(...cards.map(node=>node.bbox.y+node.bbox.height))-Math.min(...cards.map(node=>node.bbox.y))},services,'repeated aligned service cards');
        if(!all.includes(grid)){all.push(grid);setParent(grid,services,'repeated-card geometry',decisions);}
        grid.layout={...grid.layout,direction:'grid',columns:cards.length,repeated:true};
        for(const card of cards){services.children=services.children.filter(node=>node!==card);card.role='feature-card';setParent(card,grid,'repeated-card geometry',decisions);}
      }
    }
  }
  return {decisions,category:'landing'};
}

function buildSchema(elements) {
 idCounter=0;if(!Array.isArray(elements)||!elements.length)return{type:'root',id:'root-0',role:'page-root',bbox:{x:0,y:0,width:0,height:0},children:[]};
 const minX=Math.min(...elements.map(e=>e.x)),minY=Math.min(...elements.map(e=>e.y)),maxX=Math.max(...elements.map(e=>e.x+e.width)),maxY=Math.max(...elements.map(e=>e.y+e.height)),bounds={x:minX,y:minY,width:maxX-minX,height:maxY-minY};
 const root={type:'root',id:'root-0',role:'page-root',bbox:bounds,position:{x:minX,y:minY},size:{width:bounds.width,height:bounds.height},layout:{direction:'column',columns:1,gap:0,align:'stretch',repeated:false},children:[]};const nodes=elements.map(e=>makeNode(e,bounds));const macros=nodes.filter(n=>n.role&&STRUCTURAL_ROLES.has(n.role));let page=macros.find(n=>n.role==='page');
 
 // Enforce single page root
 if(!page&&macros.length){const pageNode={type:'container',id:nextId('container'),role:'page',confidence:0.98,roleConfidence:0.98,text:null,bbox:bounds,bboxPx:bounds,bboxNorm:{x:0,y:0,width:1,height:1},position:{x:minX,y:minY},size:{width:bounds.width,height:bounds.height},relativeBounds:{x:0,y:0,width:1,height:1},label:null,parentId:'root-0',parentRole:'page-root',readingOrder:0,layout:{direction:'column',columns:1,gap:12,align:'stretch',repeated:false},styleHints:{},repeatInfo:null,evidence:{source:'macro-layout-pass',grouping:'macro page',vision:null},uncertainty:0.02,source:{cv:true,ocr:false,vision:false,merged:false},children:[]};macros.push(pageNode);nodes.push(pageNode);page=pageNode;}
 
 for(const macro of macros){let parent=root;if(macro!==page)parent=smallestContaining(macro,macros,root);if(['header','main','footer'].includes(macro.role))parent=page||root;if(['gallery','product-detail','related-products','sidebar','product-area','hero-section','services-section','split-content-section','about-section','contact-section'].includes(macro.role))parent=macros.find(n=>n.role==='main'&&isContainedIn(macro,n))||page||root;if(['nav-group'].includes(macro.role))parent=macros.find(n=>n.role==='header'&&isContainedIn(macro,n))||page||root;if(['product-card-grid'].includes(macro.role))parent=macros.find(n=>n.role==='related-products'&&isContainedIn(macro,n))||page||root;if(['feature-card-grid'].includes(macro.role))parent=macros.find(n=>n.role==='services-section'&&isContainedIn(macro,n))||parent;if(['feature-card'].includes(macro.role))parent=macros.find(n=>n.role==='feature-card-grid'&&isContainedIn(macro,n))||parent;if(['media-text-column','text-media-column'].includes(macro.role))parent=macros.find(n=>n.role==='split-content-section'&&isContainedIn(macro,n))||parent;if(['map-region'].includes(macro.role))parent=macros.find(n=>n.role==='about-section'&&isContainedIn(macro,n))||parent;if(['form'].includes(macro.role))parent=macros.find(n=>n.role==='contact-section'&&isContainedIn(macro,n))||parent;parent.children.push(macro);macro.parentRole=parent.role;}
 const nonMacros=nodes.filter(n=>!macros.includes(n));const containers=nonMacros.filter(n=>n.type==='container'||n.type==='region');for(const c of containers){const parent=smallestContaining(c,[...macros,...containers],root);if(parent!==c){parent.children.push(c);c.parentRole=parent.role;}}
 for(const node of nonMacros.filter(n=>!containers.includes(n))){const parent=smallestContaining(node,[...macros,...containers,...nonMacros],root);parent.children.push(node);node.parentRole=parent.role;node.role=leafRole(node);}
 const canonicalRepair=canonicalizeLanding(root,nodes,bounds);
function clean(node){
  const seen=new Set();
  node.children=node.children.filter(c=>!seen.has(c.id)&&seen.add(c.id)).sort((a,b)=>{
    const yA = Math.round(a.bbox.y / 0.02);
    const yB = Math.round(b.bbox.y / 0.02);
    if (yA !== yB) return yA - yB;
    return a.bbox.x - b.bbox.x;
  });
  node.children.forEach((child,index)=>{child.parentId=node.id;child.parentRole=node.role;child.readingOrder=index;});const inferred=inferLayout(node);node.layout=node.layout?.direction&&node.layout.direction!=='auto'?{...inferred,...node.layout}:inferred;if(node.role==='main'&&node.children.some(c=>c.role==='gallery')&&node.children.some(c=>c.role==='product-detail'))node.layout={...node.layout,direction:'row',columns:2};if(node.role==='related-products')node.layout={...node.layout,direction:'grid',columns:Math.max(2,Math.min(4,node.children.length||3)),repeated:true};if(node.layout.repeated)node.repeatInfo={count:node.children.length,axis:node.layout.direction};node.children.forEach(clean);}clean(root);
 
 // Remove empty semantic containers
function removeEmpty(node){if(node.children){node.children=node.children.filter(child=>{if(child.type==='container'||child.type==='region'){if(!child.children||child.children.length===0)return false;removeEmpty(child);return true;}return true;});}}
function recoverOrphanedImages(node){if(!node.children)return;for(const child of node.children)recoverOrphanedImages(child);}
removeEmpty(root);
 
 const regions=[];(function collect(node){if(node.role&&node.role!=='page-root')regions.push({role:node.role,id:node.id,bounds:node.relativeBounds||node.bbox,layout:node.layout});for(const child of node.children||[])collect(child);})(root);
 const roles=new Set(regions.map(region=>region.role));
 // Use category from vision merge if available, otherwise infer from roles
 const inferredCategory=canonicalRepair?.category|| (roles.has('gallery')&&roles.has('product-detail')?'commerce-product':roles.has('sidebar')?'dashboard':roles.has('hero-section')?'landing':'generic');
 const majorNodes=regions.filter(region=>STRUCTURAL_ROLES.has(region.role)); const visionMajor=nodes.filter(node=>STRUCTURAL_ROLES.has(node.role)&&node.source?.vision).length;
 root.provenance={schemaSource:visionMajor?'vision-merged':'local-cv-ocr-fallback',visionMajorNodes:visionMajor,canonicalRepair:canonicalRepair?.decisions||[]};
 if(root.provenance.schemaSource==='vision-merged'&&!visionMajor) throw new Error('schema provenance assertion failed: vision-merged requires vision major nodes');
 root.layoutPlan={pageCategory:inferredCategory,majorZones:majorNodes,regionCount:regions.length,canonicalRepair:canonicalRepair?.decisions||[]};return root;
}
function nestByContainment(elements){return buildSchema(elements).children;}
function flattenSchema(node,acc=[]){if(node.type!=='root')acc.push({type:node.type,id:node.id,role:node.role});for(const c of node.children||[])flattenSchema(c,acc);return acc;}
module.exports={groupIntoRows,sortRowsByX,isContainedIn,nestByContainment,buildSchema,flattenSchema,verticallyOverlaps};
