// Upstream: ATtacK030130/antigrative-dashboard v0.9.1 (MIT License — Copyright (c) 2026 AG Pulse contributors)
// Integrated & adapted for Obsidian Prism under GPL-3.0-only compatibility terms.
// Discover IDs only. Conversation bodies and SQLite contents are never read.
import {opendir,lstat} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
export const conversationId=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const digest=value=>createHash('sha256').update(value).digest('hex');
const DISCOVERY_LSTAT_CONCURRENCY = 24;
async function stampInfo(file, directory = false) {
 try {
  const s = await lstat(file, { bigint: true });
  if (s.isSymbolicLink() || !(directory ? s.isDirectory() : s.isFile())) return null;
  const token = [s.size, s.mtimeNs, s.ctimeNs, s.ino].map(String).join(':');
  const mtimeMs = Number(s.mtimeNs) / 1e6;
  const size = Number(s.size);
  return {
   token,
   mtimeMs: Number.isFinite(mtimeMs) && mtimeMs > 0 ? mtimeMs : 0,
   size: Number.isFinite(size) && size >= 0 ? size : 0,
  };
 } catch (e) {
  if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return null;
  throw e;
 }
}
async function stamp(file, directory = false) {
 const info = await stampInfo(file, directory);
 return info ? info.token : null;
}
export async function discoverLocalConversations({host,home=homedir(),limit=20000}={}){
 if(!['app','ide'].includes(host))throw Error('Explicit conversation host is required');
 const base=join(home,'.gemini',host==='ide'?'antigravity-ide':'antigravity');
 const files=new Map();let errors=0,visited=0;
 for(const [name,directory] of [['conversations',false],['brain',true]]){
  const root=join(base,name);
  try{
   // Do not follow a redirected host root into another installation.
   if(!await stamp(base,true)||!await stamp(root,true))continue;
   const dir=await opendir(root);
   for await(const entry of dir){
    if(++visited>limit)throw Error('Conversation discovery budget exceeded');
    if(entry.isSymbolicLink()||!(directory?entry.isDirectory():entry.isFile()))continue;
    const id=directory?entry.name:entry.name.endsWith('.db')?entry.name.slice(0,-3):'';
    if(!conversationId.test(id))continue;
    const key=id.toLowerCase(),parts=files.get(key)||[];
    parts.push({file:join(root,entry.name),directory});files.set(key,parts);
   }
  }catch(e){if(!['ENOENT','ENOTDIR'].includes(e.code))errors++;}
  if(visited>limit)break;
 }
 const entries=[...files.entries()];
 const results=new Array(entries.length).fill(null);
 let cursor=0;
 const workerCount=Math.min(DISCOVERY_LSTAT_CONCURRENCY,entries.length);
 const runWorker=async()=>{
  while(true){
   const idx=cursor++;
   if(idx>=entries.length)return;
   const [id,parts]=entries[idx];
   const readSignatureWithMeta=async()=>{
    const values=[];
    let dbMtimeMs=0,dbSize=0,fallbackMtimeMs=0;
    for(const {file,directory}of parts){
     const info=await stampInfo(file,directory);
     if(info===null)return null;
     values.push([directory?'brain':'db',info.token]);
     if(!directory){
      if(info.mtimeMs>dbMtimeMs)dbMtimeMs=info.mtimeMs;
      if(info.size>dbSize)dbSize=info.size;
      const walInfo=await stampInfo(file+'-wal');
      values.push(['wal',walInfo?walInfo.token:null]);
     }else if(info.mtimeMs>fallbackMtimeMs){
      fallbackMtimeMs=info.mtimeMs;
     }
    }
    return {signature:digest(JSON.stringify(values)),mtimeMs:dbMtimeMs>0?dbMtimeMs:fallbackMtimeMs,dbMtimeMs,dbSize};
   };
   const readSignature=async()=>{
    const meta=await readSignatureWithMeta();
    return meta?meta.signature:null;
   };
   try{
    const meta=await readSignatureWithMeta();
    if(meta)results[idx]={id,signature:meta.signature,mtimeMs:meta.mtimeMs,dbMtimeMs:meta.dbMtimeMs,dbSize:meta.dbSize,readSignature};
   }catch{errors++;}
  }
 };
 if(workerCount>0){
  await Promise.all(Array.from({length:workerCount},()=>runWorker()));
 }
 const conversations=[];
 for(let i=0;i<results.length;i++){
  if(results[i])conversations.push(results[i]);
 }
 return {conversations,errors};
}
