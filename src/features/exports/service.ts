import {zip,strToU8,type AsyncZippable} from 'fflate'
import {supabase} from '../../lib/supabase'
import {getAuthState} from '../auth/auth'
import type {Json} from '../../types/database'
import {assetKey,type Asset,type Author,type Manifest,type Prepared,type RecordItem,type Selection} from './model'
export function assertActive(user:string,signal:AbortSignal){signal.throwIfAborted();const a=getAuthState();if(a.status!=='active'||a.user?.id!==user)throw new Error('ACTIVE_MEMBER_REQUIRED')}
export function dates(selection:Selection){const from=selection.from?new Date(`${selection.from}T00:00:00+09:00`).toISOString():undefined,until=selection.until?new Date(Date.parse(`${selection.until}T00:00:00+09:00`)+86400000).toISOString():undefined;if(from&&until&&from>=until)throw new Error('INVALID_EXPORT_RANGE');return {from_time:from,until_time:until}}
export async function collectManifest(selection:Selection,user:string,signal:AbortSignal,progress:(s:string)=>void){
  const result:Manifest={snapshot_time:'',total:0,items:[]};const seen=new Set<string>()
  for(;;){assertActive(user,signal);const last=result.items.at(-1),r=await supabase!.rpc('export_manifest',{...dates(selection),category_filter:selection.category||undefined,snapshot_time:result.snapshot_time||undefined,after_time:last?.created_at,after_id:last?.id}).abortSignal(signal);if(r.error)throw r.error;assertActive(user,signal)
    const page=r.data as unknown as Manifest;if(!result.snapshot_time){result.snapshot_time=page.snapshot_time;result.total=page.total}if(page.total!==result.total)throw new Error('EXPORT_CHANGED')
    for(const item of page.items){if(seen.has(item.id))throw new Error('EXPORT_CHANGED');seen.add(item.id);result.items.push(item)}progress(`대상 확인 ${result.items.length} / ${result.total}개`)
    if(page.items.length<200)break
  }
  if(result.items.length!==result.total)throw new Error('EXPORT_CHANGED');return result
}
export async function validate(prepared:Prepared,selection:Selection,user:string,signal:AbortSignal){assertActive(user,signal);const r=await supabase!.rpc('validate_export',{expected:prepared.records.map(r=>({id:r.document.id,checksum:r.checksum})) as Json,with_comments:selection.comments,with_images:selection.images}).abortSignal(signal);if(r.error)throw r.error;assertActive(user,signal)}
export async function prepare(manifest:Manifest,index:number,selection:Selection,user:string,signal:AbortSignal,progress:(s:string)=>void):Promise<Prepared>{
  assertActive(user,signal);const ids=manifest.items.slice(index*selection.size,(index+1)*selection.size).map(i=>i.id),assets=new Map<string,Asset>(),release=()=>{assets.forEach(a=>URL.revokeObjectURL(a.url));assets.clear()}
  try{progress(`${index+1}번 파일: 글 ${ids.length}개 읽는 중`);const r=await supabase!.rpc('export_batch',{post_ids:ids,with_comments:selection.comments,with_images:selection.images}).abortSignal(signal);if(r.error)throw r.error;assertActive(user,signal);const records=r.data as unknown as RecordItem[]
    if(records.length!==ids.length||records.some((r,i)=>r.document.id!==ids[i]))throw new Error('EXPORT_CHANGED')
    const requests=new Map<string,{id:string;full:boolean}>(),add=(id:string|null,full=false)=>{if(id)requests.set(assetKey(id,full),{id,full})}
    for(const {document:p} of records){add(p.author.avatar_asset_id);p.images.forEach(i=>add(i.asset_id,true));p.comments.forEach(c=>add(c.author?.avatar_asset_id??null));p.poll?.results?.voters.forEach(v=>add(v.avatar_asset_id))}
    const paths=new Map<string,{storage_path:string;thumbnail_path:string}>(),assetIds=[...new Set([...requests.values()].map(r=>r.id))]
    for(let offset=0;offset<assetIds.length;offset+=50){const r=await supabase!.rpc('get_asset_paths',{asset_ids:assetIds.slice(offset,offset+50)}).abortSignal(signal);if(r.error)throw r.error;r.data.forEach(a=>paths.set(a.id,a))}
    let bytes=0,done=0
    for(const [key,request] of requests){assertActive(user,signal);const path=paths.get(request.id);if(!path)throw new Error('ASSET_UNAVAILABLE')
      const file=await supabase!.storage.from('community').download(request.full?path.storage_path:path.thumbnail_path,{},{signal,cache:'no-store'});if(file.error||!file.data)throw new Error('ASSET_UNAVAILABLE');assertActive(user,signal);bytes+=file.data.size;if(bytes>64*1024*1024)throw new Error('EXPORT_TOO_LARGE')
      const data=new Uint8Array(await file.data.arrayBuffer());assertActive(user,signal);assets.set(key,{path:`images/${request.id}-${request.full?'image':'avatar'}.webp`,url:URL.createObjectURL(file.data),bytes:data});progress(`${index+1}번 파일: 이미지 ${++done} / ${requests.size}개`)
    }
    const prepared={records,assets,index,release};await validate(prepared,selection,user,signal);return prepared
  }catch(e){release();throw e}
}
export function archive(manifest:Manifest,prepared:Prepared,selection:Selection){
  const avatar=(a:Author|null)=>a?{name:a.name,avatar:a.avatar_asset_id?prepared.assets.get(assetKey(a.avatar_asset_id))?.path??null:null}:null
  return {schema_version:1,exported_at:new Date().toISOString(),snapshot_time:manifest.snapshot_time,time_zone:'Asia/Seoul',selection:{category_id:selection.category||null,from:selection.from||null,through:selection.until||null,comments:selection.comments,images:selection.images},selection_count:manifest.total,part_number:prepared.index+1,part_count:Math.ceil(manifest.total/selection.size),post_count:prepared.records.length,
    posts:prepared.records.map(({document:p})=>({id:p.id,type:p.type,title:p.title,body:p.body,body_text:p.body_text,created_at:p.created_at,updated_at:p.updated_at,notice:p.notice,category:p.category,author:avatar(p.author),images:p.images.map(i=>({path:prepared.assets.get(assetKey(i.asset_id,true))!.path,position:i.position})),comments:p.comments.map(c=>({id:c.id,parent_id:c.parent_id,created_at:c.created_at,updated_at:c.updated_at,deleted:c.deleted,body:c.body,author:avatar(c.author)})),poll:p.poll?{question:p.poll.question,multiple:p.poll.multiple,anonymous:p.poll.anonymous,closed:p.poll.closed,closes_at:p.poll.closes_at,results_policy:p.poll.results_policy,options:p.poll.options,results:p.poll.results?{participants:p.poll.results.participants,options:p.poll.results.options,voters:p.poll.results.voters.map(v=>({...avatar(v),choices:v.choices}))}:null}:null}))}
}
export async function makeFile(manifest:Manifest,prepared:Prepared,selection:Selection,signal:AbortSignal){
  signal.throwIfAborted();const json=JSON.stringify(archive(manifest,prepared,selection),null,2)
  if(!selection.images)return new Blob([json],{type:'application/json;charset=utf-8'})
  const files:AsyncZippable={'archive.json':strToU8(json),'README.txt':strToU8('작은 모임 회원용 아카이브\narchive.json의 images/ 상대경로는 같은 ZIP의 실제 이미지 파일을 가리킵니다.\n복원용 DB 백업이 아닙니다. 모든 분할 파일을 함께 보관하세요.\n')};prepared.assets.forEach(a=>{files[a.path]=[a.bytes,{level:0}]})
  return new Promise<Blob>((resolve,reject)=>{const abort=()=>{terminate();reject(signal.reason)},terminate=zip(files,{level:1},(error,data)=>{signal.removeEventListener('abort',abort);if(error)reject(error);else resolve(new Blob([Uint8Array.from(data).buffer],{type:'application/zip'}))});signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort()})
}
export const filename=(manifest:Manifest,index:number,selection:Selection)=>`mini-commu-${manifest.snapshot_time.slice(0,10)}-${String(index+1).padStart(3,'0')}-of-${String(Math.ceil(manifest.total/selection.size)).padStart(3,'0')}`
