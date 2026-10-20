import {useEffect,useRef,useState,type Dispatch,type SetStateAction} from 'react'
import {profileLimits} from '../../../supabase/functions/profile-image/limits.mjs'
import {getAuthState,useAuth} from '../auth/auth'
import {contentError} from './model'
import {AssetImage} from './Images'
import {uploadAttachment} from './upload'
type Pending={key:string;file:File;url:string;error:string}
export function AttachmentPicker({ids,setIds,onBlocked,disabled}:{ids:string[];setIds:Dispatch<SetStateAction<string[]>>;onBlocked:(v:boolean)=>void;disabled:boolean}){
  const auth=useAuth(),[pending,setPending]=useState<Pending[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),urls=useRef(new Set<string>())
  useEffect(()=>{onBlocked(busy||pending.length>0)},[busy,pending.length,onBlocked])
  useEffect(()=>{const active=urls.current;return()=>{for(const url of active)URL.revokeObjectURL(url)}},[])
  async function upload(items:Pending[]){
    setBusy(true)
    for(const item of items){
      if(getAuthState().status!=='active'||getAuthState().user?.id!==auth.user?.id)break
      try{const id=await uploadAttachment(item.file,auth.user!.id);if(getAuthState().status!=='active'||getAuthState().user?.id!==auth.user?.id)break;setIds(old=>[...old,id]);setPending(old=>old.filter(p=>p.key!==item.key));URL.revokeObjectURL(item.url);urls.current.delete(item.url)}
      catch(e){setPending(old=>old.map(p=>p.key===item.key?{...p,error:contentError(e)}:p))}
    }
    setBusy(false)
  }
  return <section className="attachment-picker"><h2>첨부 이미지 {ids.length+pending.length} / 4</h2><p className="muted">JPEG·PNG·WebP, 파일당 10 MiB 이하. 업로드 후에도 순서를 바꿀 수 있어요.</p>
    <label htmlFor="post-images">이미지 추가</label><input id="post-images" type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={disabled||busy||ids.length+pending.length>=4} onChange={e=>{
      const files=Array.from(e.target.files??[]);e.target.value='';if(files.some(f=>f.size>profileLimits.inputBytes)){setError(contentError(new Error('IMAGE_TOO_LARGE')));return}if(files.some(f=>!['image/jpeg','image/png','image/webp'].includes(f.type))){setError(contentError(new Error('INVALID_IMAGE')));return}if(files.length+ids.length+pending.length>4){setError('이미지는 최대 4장입니다.');return}setError('');const added=files.map(file=>{const url=URL.createObjectURL(file);urls.current.add(url);return {key:crypto.randomUUID(),file,url,error:''}});setPending(old=>[...old,...added]);void upload(added)
    }}/>
    <div className="attachment-grid">{ids.map((id,i)=><div className="attachment-item" key={id}><AssetImage id={id} alt={`첨부 ${i+1}`}/><div><button type="button" disabled={disabled||busy||i===0} onClick={()=>setIds(old=>{const next=[...old];[next[i-1],next[i]]=[next[i],next[i-1]];return next})}>이미지 {i+1} 앞으로</button><button type="button" disabled={disabled||busy||i===ids.length-1} onClick={()=>setIds(old=>{const next=[...old];[next[i+1],next[i]]=[next[i],next[i+1]];return next})}>이미지 {i+1} 뒤로</button><button type="button" disabled={disabled||busy} onClick={()=>setIds(old=>old.filter(x=>x!==id))}>이미지 {i+1} 제거</button></div></div>)}
      {pending.map(p=><div className="attachment-item" key={p.key}><img src={p.url} alt={`${p.file.name} 업로드 전 미리보기`}/><p>{p.error||'이미지 확인 및 저장 중…'}</p>{p.error&&<button type="button" disabled={busy||disabled} onClick={()=>void upload([p])}>업로드 재시도</button>}<button type="button" disabled={busy||disabled} onClick={()=>{setPending(old=>old.filter(x=>x.key!==p.key));URL.revokeObjectURL(p.url);urls.current.delete(p.url)}}>대기 이미지 제거</button></div>)}
    </div>{error&&<p role="alert">{error}</p>}
  </section>
}
