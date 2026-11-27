(function(root,factory){
const api=factory();if(root)root.__agMotionEngine=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window,function(){
'use strict';
const SPRING_PRESETS=Object.freeze({
snappy:{stiffness:420,damping:30,mass:.9},bouncy:{stiffness:380,damping:20,mass:1},
default:{stiffness:380,damping:26,mass:1},gentle:{stiffness:260,damping:26,mass:1.05},
micro:{stiffness:440,damping:24,mass:.85},indicator:{stiffness:430,damping:32,mass:.9},
});
const TIERS=new Set(['off','subtle','standard','ultra']);
const CACHE=new Map(),ANIMS=new WeakMap(),ROOTS=new WeakMap(),CDS=new WeakMap(),TIMERS=new WeakMap(),EXCL_CACHE=new WeakMap();
const HOST_SEL='button, a, [role="button"], summary, [data-icon-host]';
const THOUGHT_CLS_RE=/\b(ag-prism-thought-raw-toggle|ag-prism-thought-overlay)\b/;
const BEZ='cubic-bezier(0.22, 1.25, 0.36, 1)',clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
let exclEpoch=1;

function invalidateExclusionCache(){exclEpoch=(exclEpoch+1)|0;}

// Isolate Thought Translator overlay & raw-toggle controls from micro-interaction spring wrapping (WeakMap cached for 300Hz pointerover)
function isThoughtExcluded(el){
if(!el||typeof el!=='object')return false;
const bucket=((typeof performance!=='undefined'&&performance.now?performance.now():Date.now())*(1/48))|0;
const tag=(exclEpoch<<20)^bucket;
const hitC=EXCL_CACHE.get(el);
const topP=el.parentElement||el.parentNode||null;
const topCls=String((el.getAttribute&&el.getAttribute('class'))||el.className||'');
const topIg=Boolean(el.hasAttribute&&el.hasAttribute('data-prism-ignore'));
if(hitC&&hitC.tag===tag&&hitC.p===topP&&hitC.cls===topCls&&hitC.ig===topIg)return hitC.v;
const visited=[];
let cur=el,res=false;
while(cur&&typeof cur==='object'){
const p=cur.parentElement||cur.parentNode||null;
const cls=cur===el?topCls:String((cur.getAttribute&&cur.getAttribute('class'))||cur.className||'');
const ig=cur===el?topIg:Boolean(cur.hasAttribute&&cur.hasAttribute('data-prism-ignore'));
if(ig||THOUGHT_CLS_RE.test(cls)){res=true;visited.push({n:cur,p,cls,ig});break;}
const c=EXCL_CACHE.get(cur);
if(c&&c.tag===tag&&c.p===p&&c.cls===cls&&c.ig===ig){res=c.v;break;}
visited.push({n:cur,p,cls,ig});
cur=p;
}
for(let i=0;i<visited.length;i++){
const it=visited[i];
EXCL_CACHE.set(it.n,{tag,p:it.p,cls:it.cls,ig:it.ig,v:res});
}
return res;
}

function prefersReducedMotion(ov){
if(typeof ov==='boolean')return ov;
try{return Boolean(globalThis.matchMedia&&globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches);}catch(_){return false;}
}

function getMotionTier(ov){
if(prefersReducedMotion(typeof ov==='boolean'?ov:undefined))return 'off';
if(typeof ov==='string'&&TIERS.has(ov))return ov;
try{
const el=typeof document!=='undefined'&&document.documentElement;
const raw=el&&el.getAttribute?el.getAttribute('data-ag-cs-motion')||'ultra':'ultra';
return TIERS.has(raw)?raw:'ultra';
}catch(_){return 'ultra';}
}

function resolveTier(o){
if(o&&typeof o.reducedMotion==='boolean')return o.reducedMotion?'off':(o.motionTier&&TIERS.has(o.motionTier)?o.motionTier:getMotionTier(false));
return getMotionTier(o&&o.motionTier);
}

function hasLinearCss(){
try{if(typeof CSS!=='undefined'&&CSS.supports)return CSS.supports('animation-timing-function','linear(0, 1)');}catch(_){}
return true;
}

function springLinear(opts={}){
const p=typeof opts==='string'?SPRING_PRESETS[opts]:opts&&opts.preset?SPRING_PRESETS[opts.preset]:null;
const k=clamp(+((opts&&opts.stiffness)??(p&&p.stiffness)??380),20,3000);
const c=clamp(+((opts&&opts.damping)??(p&&p.damping)??26),1,400);
const m=clamp(+((opts&&opts.mass)??(p&&p.mass)??1),.05,20);
const v0=clamp(+((opts&&opts.velocity)??0),-50,50);
const rD=clamp(+((opts&&opts.restDelta)??.001),.0001,.05);
const rS=clamp(+((opts&&opts.restSpeed)??.001),.0001,.05);
const n=Math.round(clamp(+((opts&&opts.sampleCount)??40),12,96));
const key=`${k}|${c}|${m}|${v0}|${rD}|${rS}|${n}`;
if(CACHE.has(key))return CACHE.get(key);

const w0=Math.sqrt(k/m),z=c/(2*Math.sqrt(k*m));
let pos,vel;
if(z<1-1e-5){
const wd=w0*Math.sqrt(1-z*z),b=(v0-z*w0)/wd;
pos=t=>t<=0?0:1+Math.exp(-z*w0*t)*(-Math.cos(wd*t)+b*Math.sin(wd*t));
vel=t=>{if(t<=0)return v0;const cv=Math.cos(wd*t),sv=Math.sin(wd*t);return Math.exp(-z*w0*t)*(-z*w0*(-cv+b*sv)+wd*sv+b*wd*cv);};
}else if(z>1+1e-5){
const g=w0*Math.sqrt(z*z-1),r1=-z*w0+g,r2=-z*w0-g,c1=(v0+r2)/(2*g),c2=-1-c1;
pos=t=>t<=0?0:1+c1*Math.exp(r1*t)+c2*Math.exp(r2*t);
vel=t=>t<=0?v0:c1*r1*Math.exp(r1*t)+c2*r2*Math.exp(r2*t);
}else{
const b=v0-w0;
pos=t=>t<=0?0:1+Math.exp(-w0*t)*(-1+b*t);
vel=t=>t<=0?v0:Math.exp(-w0*t)*(-w0*(-1+b*t)+b);
}

const dt=1/240;let endT=.08;
for(let t=dt;t<=3.6;t+=dt)if(Math.abs(1-pos(t))>rD||Math.abs(vel(t))>rS)endT=t;
const sec=clamp(endT+dt,.08,3.6),samples=new Array(n);
samples[0]=0;for(let i=1;i<n-1;i++)samples[i]=+pos((i/(n-1))*sec).toFixed(4);samples[n-1]=1;
const res=Object.freeze({easing:`linear(${samples.join(', ')})`,durationMs:Math.round(sec*1000),samples:Object.freeze(samples),solveAt:pos});
if(CACHE.size>=64)CACHE.delete(CACHE.keys().next().value);
CACHE.set(key,res);return res;
}

const noop=(durationMs=0,easing='linear')=>({animation:null,durationMs,easing,finished:Promise.resolve(),cancel(){}});

function commitFinal(el,kf){
if(!el||!el.style||!kf)return;
let last=Array.isArray(kf)?kf[kf.length-1]:null;
if(!last&&typeof kf==='object'){last={};for(const [p,v] of Object.entries(kf))last[p]=Array.isArray(v)?v[v.length-1]:v;}
if(!last)return;
for(const [p,v] of Object.entries(last))if(p!=='offset'&&p!=='easing'&&p!=='composite'&&v!=null)try{el.style[p]=String(v);}catch(_){}
}

function spring(el,kf,opts={}){
if(!el||!kf||isThoughtExcluded(el))return noop();
const tier=resolveTier(opts),slot=String(opts.slot||'default');
let slots=ANIMS.get(el);if(!slots)ANIMS.set(el,(slots=new Map()));
const prev=slots.get(slot);
if(prev){try{if(opts.interrupt==='commit'&&prev.commitStyles)prev.commitStyles();prev.cancel();}catch(_){}slots.delete(slot);}
if(opts.transformBox&&el.style)el.style.transformBox=opts.transformBox;
if(opts.transformOrigin&&el.style)el.style.transformOrigin=opts.transformOrigin;
const fill=opts.fill||'none';
if(tier==='off'){
if(opts.commitFinal!==false&&(fill==='forwards'||fill==='both'||opts.applyReducedFinal))commitFinal(el,kf);
return noop(0,'step-end');
}
const sub=tier==='subtle',solved=sub?null:springLinear(opts);
const durationMs=sub?120:Number.isFinite(opts.durationMs)?Math.max(16,Math.round(opts.durationMs)):solved.durationMs;
const easing=sub?'ease-out':hasLinearCss()?solved.easing:BEZ;
const useKf=sub&&Array.isArray(kf)&&kf.length>2?[kf[0],kf[kf.length-1]]:kf;
const delay=Math.max(0,+opts.delay||0);
if(typeof el.animate!=='function'){if(fill==='forwards'||fill==='both')commitFinal(el,useKf);return noop(durationMs,easing);}
let anim=null;
try{anim=el.animate(useKf,{duration:durationMs,delay,easing,fill});}
catch(_){
try{anim=el.animate(useKf,{duration:Math.min(durationMs,360),delay,easing:sub?'ease-out':BEZ,fill});}
catch(_e){if(fill==='forwards'||fill==='both')commitFinal(el,useKf);return noop(durationMs,easing);}
}
slots.set(slot,anim);
const clr=()=>{if(slots.get(slot)===anim)slots.delete(slot);};
const finished=anim&&anim.finished&&anim.finished.then?anim.finished.then(()=>{clr();if(opts.commitOnFinish&&anim.commitStyles)try{anim.commitStyles();anim.cancel();}catch(_){}},clr):Promise.resolve();
return {animation:anim,durationMs,easing,finished,cancel(){try{if(anim)anim.cancel();}catch(_){}clr();}};
}

function groupWrap(hs){
Object.defineProperty(hs,'finished',{value:Promise.all(hs.map(h=>h.finished)),enumerable:false});
Object.defineProperty(hs,'cancelAll',{value(){hs.forEach(h=>h.cancel());},enumerable:false});
return hs;
}

function stagger(els,kf,opts={}){
let list=[];
if(typeof els==='string'){const sc=opts.root||(typeof document!=='undefined'?document:null);if(sc&&sc.querySelectorAll)list=Array.from(sc.querySelectorAll(els));}
else if(els)list=typeof els.length==='number'?Array.from(els).filter(Boolean):[els];
const tier=resolveTier(opts),rawS=clamp(+(opts.delayStep??opts.stepMs??28),0,400),rawM=clamp(+(opts.maxDelay??320),0,2000);
const step=tier==='off'?0:tier==='subtle'?Math.min(rawS,16):rawS;
const init=tier==='off'?0:Math.max(0,+(opts.initialDelay??0));
const maxD=tier==='off'?0:tier==='subtle'?Math.min(rawM,96):rawM;
return groupWrap(list.map((el,i)=>spring(el,typeof kf==='function'?kf(el,i,list.length):kf,{stiffness:360,damping:28,...opts,delay:Math.min(maxD,init+i*step),slot:opts.slot||'stagger'})));
}

function toRect(r){
if(!r)return null;
if(typeof r.getBoundingClientRect==='function')r=r.getBoundingClientRect();
return Number.isFinite(r.left)&&Number.isFinite(r.top)?{left:+r.left,top:+r.top,width:+r.width||0,height:+r.height||0}:null;
}

function glideIndicator(el,prevR,nextR,opts={}){
if(!el)return noop();
let tgt=el,fArg=prevR,tArg=nextR,ro=opts||{};
if(toRect(nextR)===null&&prevR&&prevR!==el&&(typeof prevR.animate==='function'||prevR.tagName)){
tgt=prevR;fArg=el;tArg=prevR;if(nextR&&typeof nextR==='object')ro=nextR;
}
if(resolveTier(ro)==='off')return noop(0,'step-end');
const from=toRect(fArg),to=toRect(tArg||tgt);
if(!to||to.width<=0||to.height<=0)return noop();
if(!from||from.width<=0||from.height<=0)return spring(tgt,[{opacity:0,transform:'scale(0.94)'},{opacity:1,transform:'scale(1)'}],{...SPRING_PRESETS.indicator,...ro,slot:'glide'});
const dx=from.left-to.left,dy=from.top-to.top,sx=from.width/to.width,sy=from.height/to.height;
const noSc=Math.abs(sx-1)<.025&&Math.abs(sy-1)<.025;
if(Math.abs(dx)<.5&&Math.abs(dy)<.5&&noSc)return noop();
const scOn=ro.scaleAxis!==false&&!noSc;
const tf0=scOn?`translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`:`translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0)`;
return spring(tgt,[{transform:tf0},{transform:'translate3d(0, 0, 0) scale(1, 1)'}],{...SPRING_PRESETS.indicator,...ro,transformOrigin:scOn?'0 0':'50% 50%',slot:'glide'});
}

function drawStroke(root,opts={}){
if(!root)return groupWrap([]);
const sel=opts.selector||'path, line, polyline, circle, ellipse',nodes=[];
if(root.matches&&root.matches(sel))nodes.push(root);
if(root.querySelectorAll)nodes.push(...Array.from(root.querySelectorAll(sel)));
const tier=resolveTier(opts),rawS=clamp(+(opts.staggerMs??45),0,300),stepMs=tier==='subtle'?Math.min(rawS,20):rawS;
return groupWrap(nodes.map((node,i)=>{
let len=28;
if(typeof node.getTotalLength==='function'){try{const m=node.getTotalLength();if(m>0)len=m;}catch(_){}}
else if(node.getAttribute&&node.getAttribute('data-path-length'))len=+node.getAttribute('data-path-length')||28;
const dash=`${Math.ceil(len+1)}`;
if(node.style){node.style.strokeDasharray=dash;node.style.strokeDashoffset=tier==='off'?'0':dash;if(tier==='off'&&opts.fadeIn!==false)node.style.opacity='1';}
if(tier==='off')return noop(0,'step-end');
return spring(node,[{strokeDashoffset:dash,opacity:opts.fadeIn===false?1:.35},{strokeDashoffset:'0',opacity:1}],{
stiffness:opts.stiffness??260,damping:opts.damping??26,delay:(opts.delay||0)+i*stepMs,
fill:'forwards',commitOnFinish:true,reducedMotion:opts.reducedMotion,motionTier:opts.motionTier,slot:'stroke',
});
}));
}

function findTarget(el){
if(!el||isThoughtExcluded(el))return null;
let ic=el.getAttribute&&el.getAttribute('data-anim-icon')?el:null,host=ic?(el.closest&&el.closest(HOST_SEL))||el:null;
if(!ic&&el.closest){ic=el.closest('[data-anim-icon]');if(ic)host=ic.closest(HOST_SEL)||ic;}
if(!ic&&el.querySelector){ic=el.querySelector('[data-anim-icon]');if(ic)host=el;}
if(!ic&&el.closest){const b=el.closest(HOST_SEL);if(b&&b.querySelector){ic=b.querySelector('[data-anim-icon]');if(ic)host=b;}}
if(!ic||isThoughtExcluded(host||ic))return null;
const svg=ic.tagName&&ic.tagName.toLowerCase()==='svg'?ic:(ic.querySelector&&ic.querySelector('svg'))||ic;
return {iconEl:ic,svgEl:svg,hostEl:host||ic,iconName:ic.getAttribute('data-anim-icon')||''};
}

function triggerIcon(el,state='trigger',opts={}){
const t=findTarget(el);if(!t)return noop();
const {iconEl,svgEl,hostEl,iconName}=t,tier=resolveTier(opts);
const reg=opts.iconRegistry||(typeof globalThis!=='undefined'&&globalThis.__agAnimatedIcons);
const spec=((reg&&reg.ICON_SPECS)||reg||{})[iconName];
const oldT=TIMERS.get(hostEl);if(oldT){clearTimeout(oldT);TIMERS.delete(hostEl);}
if(state&&state!=='hover'&&state!=='press'){
if(iconEl.setAttribute)iconEl.setAttribute('data-icon-state',state);
if(svgEl!==iconEl&&svgEl.setAttribute)svgEl.setAttribute('data-icon-state',state);
}
if(iconName==='copy-check'&&(state==='check'||state==='copy')){
const cp=svgEl.querySelector&&svgEl.querySelector('.ai-part-copy'),ck=svgEl.querySelector&&svgEl.querySelector('.ai-part-check');
if(cp&&cp.style)cp.style.opacity=state==='check'?'0':'1';
if(ck&&ck.style)ck.style.opacity=state==='check'?'1':'0';
}
if(tier==='subtle'&&state==='hover')return {iconName,stateName:state,handles:[],finished:Promise.resolve(),cancel(){}};
const steps=(spec&&spec.states&&spec.states[state])||(spec&&state==='trigger'&&spec.trigger)||(spec&&spec.hover)||
[{keyframes:[{transform:'scale(1)'},{transform:'scale(1.12)'},{transform:'scale(1)'}],origin:'12px 12px'}];
const handles=[];
for(const s of steps){
const nodes=s.part?(svgEl.querySelectorAll?Array.from(svgEl.querySelectorAll(s.part)):[]):[svgEl];
nodes.forEach((node,i)=>{
if(s.drawStroke)handles.push(...drawStroke(node,{stiffness:s.stiffness??290,damping:s.damping??26,reducedMotion:opts.reducedMotion,motionTier:opts.motionTier}));
if(s.keyframes)handles.push(spring(node,s.keyframes,{
stiffness:s.stiffness??420,damping:s.damping??22,mass:s.mass??.85,delay:(s.delay||0)+i*(s.staggerMs||45),
fill:s.fill||'none',transformBox:s.box||'view-box',transformOrigin:s.origin||'12px 12px',
reducedMotion:opts.reducedMotion,motionTier:opts.motionTier,applyReducedFinal:s.fill==='forwards'||s.fill==='both',slot:s.slot||'micro',
}));
});
}
const revMs=+opts.revertAfterMs||0;
if(revMs>0&&state==='check'&&iconName==='copy-check'){
TIMERS.set(hostEl,setTimeout(()=>{TIMERS.delete(hostEl);triggerIcon(hostEl,'copy',{...opts,revertAfterMs:0});},revMs));
}
return {iconName,stateName:state,handles,finished:Promise.all(handles.map(h=>h.finished)),cancel(){handles.forEach(h=>h.cancel());}};
}

function isEditable(el){
if(!el)return false;
const tag=(el.tagName||'').toUpperCase();
if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||el.isContentEditable)return true;
const ce=el.getAttribute?el.getAttribute('contenteditable'):null;
return ce===''||ce==='true'||ce==='plaintext-only'||Boolean(el.getAttribute&&el.getAttribute('role')==='textbox');
}
const isDis=el=>!el||Boolean(el.disabled||(el.getAttribute&&(el.getAttribute('disabled')!==null||el.getAttribute('aria-disabled')==='true')));

function findPressBtn(target){
if(!target||isThoughtExcluded(target))return null;
let cur=target,hit=null;
while(cur){
if(isEditable(cur)||(cur.getAttribute&&cur.getAttribute('data-no-press-spring')!==null)||isThoughtExcluded(cur))return null;
if(!hit){
const tag=(cur.tagName||'').toUpperCase();
if(tag==='BUTTON'||(cur.getAttribute&&cur.getAttribute('role')==='button')){
if(isDis(cur))return null;
const tid=(cur.getAttribute&&cur.getAttribute('data-testid'))||'',cls=String((cur.getAttribute&&cur.getAttribute('class'))||cur.className||'');
if(tid==='agent-input-box'||tid==='conversation-view'||/\b(surface-composer-card|monaco-editor|cm-editor|agy-home|ag-prism-thought-raw-toggle|ag-prism-thought-overlay)\b/.test(cls))return null;
if(cur.querySelector){
let ed=false;
try{ed=Boolean(cur.querySelector('textarea')||cur.querySelector('[contenteditable="true"]')||cur.querySelector('[role="textbox"]'));}
catch(_){try{ed=Boolean(cur.querySelector('textarea'));}catch(_e){}}
if(ed)return null;
}
if(typeof cur.getBoundingClientRect==='function'){try{const b=cur.getBoundingClientRect();if(b&&(b.width>420||b.height>96))return null;}catch(_){}}
hit=cur;
}
}
cur=cur.parentElement||null;
}
return hit;
}

function bindMicroInteractions(root,opts={}){
const r=root||(typeof document!=='undefined'?document:null);
if(!r||typeof r.addEventListener!=='function')return {root:r,unbind(){},trigger:triggerIcon};
if(ROOTS.has(r))return ROOTS.get(r);
const cd=clamp(+(opts.cooldownMs??150),40,1000);
const gate=h=>{const now=Date.now();if(now-(CDS.get(h)||0)<cd)return false;CDS.set(h,now);return true;};
let lastOv=null;
const onOver=e=>{
if(!e)return;
const tier=resolveTier(opts);if(tier==='off'||tier==='subtle')return;
const raw=e.target;if(!raw||raw===lastOv)return;lastOv=raw;
try{if(raw.closest&&raw.closest('[data-testid="conversation-row-sidebar"],[data-hover-card-popup]'))return;}catch(_){}
if(isThoughtExcluded(raw))return;
const t=findTarget(raw);
if(!t||isDis(t.hostEl)||(e.relatedTarget&&t.hostEl.contains&&t.hostEl.contains(e.relatedTarget)))return;
if(gate(t.hostEl))triggerIcon(t.hostEl,'hover',opts);
};
const onFocus=e=>{
if(!e)return;
const tier=resolveTier(opts);if(tier==='off'||tier==='subtle')return;
if(isThoughtExcluded(e.target))return;
try{if(e.target.matches&&!e.target.matches(':focus-visible'))return;}catch(_){}
const t=findTarget(e.target);if(t&&!isDis(t.hostEl)&&gate(t.hostEl))triggerIcon(t.hostEl,'hover',opts);
};
const onDown=e=>{
if(!e||(typeof e.button==='number'&&e.button!==0)||isThoughtExcluded(e.target))return;
const tier=resolveTier(opts);if(tier!=='standard'&&tier!=='ultra')return;
const t=findTarget(e.target);
if(t&&!isDis(t.hostEl)){
spring(t.svgEl,[{transform:'scale(1)'},{transform:'scale(0.9)'},{transform:'scale(1)'}],{
stiffness:520,damping:28,mass:.7,transformBox:'view-box',transformOrigin:'12px 12px',
reducedMotion:opts.reducedMotion,motionTier:opts.motionTier,slot:'press',
});
}
const btn=findPressBtn(e.target);
if(btn){
const tf=btn.style&&btn.style.transform?String(btn.style.transform).trim():'';
const kf=tf&&tf!=='none'&&!/^scale\([^)]+\)$/.test(tf)?[{scale:'1'},{scale:'0.965'},{scale:'1'}]:[{transform:'scale(1)'},{transform:'scale(0.965)'},{transform:'scale(1)'}];
spring(btn,kf,{stiffness:520,damping:30,mass:.72,reducedMotion:opts.reducedMotion,motionTier:opts.motionTier,slot:'btn-press'});
}
};
r.addEventListener('pointerover',onOver,{passive:true});
r.addEventListener('focusin',onFocus,{passive:true});
r.addEventListener('pointerdown',onDown,{passive:true});
const binding={root:r,trigger:triggerIcon,unbind(){
r.removeEventListener('pointerover',onOver);r.removeEventListener('focusin',onFocus);r.removeEventListener('pointerdown',onDown);ROOTS.delete(r);
}};
ROOTS.set(r,binding);return binding;
}

return Object.freeze({SPRING_PRESETS,prefersReducedMotion,getMotionTier,springLinear,spring,stagger,glideIndicator,drawStroke,bindMicroInteractions,triggerIcon,isThoughtExcluded,invalidateExclusionCache});
});
