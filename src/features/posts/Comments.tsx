import {useState,type FormEvent} from 'react'
import {Link} from 'react-router'
import {supabase} from '../../lib/supabase'
import {useCharacters} from '../characters/context'
import {Avatar} from '../characters/Avatar'
import {contentError,dateText,textLength,type Comment} from './model'
import {ModerationForm} from './PostAdministration'
import {useAuth} from '../auth/auth'
export function Comments({postId,items,reload}:{postId:string;items:Comment[];reload:()=>Promise<void>}){
  const auth=useAuth()
  const [reply,setReply]=useState<string|null>(null),[editing,setEditing]=useState<Comment|null>(null),[remove,setRemove]=useState<Comment|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  async function deleteComment(c:Comment){setBusy(true);setError('');try{const r=await supabase!.rpc('change_comment',{target_id:c.id,expected_version:c.version,remove:true});if(r.error)throw r.error;setRemove(null);await reload()}catch(e){setError(contentError(e))}finally{setBusy(false)}}
  function card(c:Comment,isReply=false){return <article key={c.id} className={`comment ${isReply?'reply':''}`} aria-label={c.deleted?'삭제된 댓글':`${c.author_name_snapshot} 댓글`}>
    {c.deleted?<p>삭제된 댓글입니다.</p>:<><div className="author-line"><Avatar assetId={c.author_avatar_asset_id} name={c.author_name_snapshot}/><span>{c.author_name_snapshot} · {dateText(c.created_at)}{c.version>1?' · 수정됨':''}</span></div><p className="comment-body">{c.body}</p><div className="comment-actions">{!isReply&&<button onClick={()=>{setReply(c.id);setEditing(null)}}>답글 달기</button>}{c.can_edit&&<><button onClick={()=>{setEditing(c);setReply(null)}}>댓글 수정</button><button onClick={()=>setRemove(c)}>댓글 삭제</button></>}</div></>}
    {!c.deleted&&auth.role==='admin'&&<ModerationForm kind="comment" id={c.id} version={c.version} reload={reload}/>}
    {remove?.id===c.id&&<div className="delete-confirm"><p>이 댓글을 삭제할까요? 답글은 유지됩니다.</p><button disabled={busy} onClick={()=>void deleteComment(c)}>댓글 삭제 확정</button><button disabled={busy} onClick={()=>setRemove(null)}>취소</button></div>}
    {editing?.id===c.id&&<CommentForm key={`edit:${c.id}`} postId={postId} initial={editing} onDone={async()=>{setEditing(null);await reload()}} onCancel={()=>setEditing(null)}/>}
    {reply===c.id&&<CommentForm key={`reply:${c.id}`} postId={postId} parentId={c.id} onDone={async()=>{setReply(null);await reload()}} onCancel={()=>setReply(null)}/>}
  </article>}
  return <section className="comments"><h2>댓글 {items.filter(c=>!c.deleted).length}</h2>{error&&<p role="alert" className="form-error">{error}<button onClick={()=>void reload()}>댓글 새로고침</button></p>}
    {items.filter(c=>!c.parent_id).map(c=><div key={c.id}>{card(c)}{items.filter(r=>r.parent_id===c.id).map(r=>card(r,true))}</div>)}
    <CommentForm postId={postId} onDone={reload}/>
  </section>
}
function CommentForm({postId,parentId,initial,onDone,onCancel}:{postId:string;parentId?:string;initial?:Comment;onDone:()=>Promise<void>;onCancel?:()=>void}){
  const {selected}=useCharacters(),[body,setBody]=useState(initial?.body??''),[requestId,setRequestId]=useState(()=>crypto.randomUUID()),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const label=initial?'댓글 수정 내용':parentId?'답글 내용':'댓글 내용',inputId=`comment-${initial?.id??parentId??'new'}`
  async function save(e:FormEvent){e.preventDefault();if(busy)return;if(!body.trim()||textLength(body.trim())>1000){setError('댓글은 1~1,000자로 입력해 주세요.');return}if(!initial&&!selected){setError('캐릭터를 선택해 주세요.');return}setBusy(true);setError('');try{
    const r=initial?await supabase!.rpc('change_comment',{target_id:initial.id,expected_version:initial.version,comment_body:body}):await supabase!.rpc('create_comment',{request_id:requestId,target_post:postId,character_id:selected!.id,comment_body:body,parent_comment:parentId})
    if(r.error)throw r.error;setBody('');setRequestId(crypto.randomUUID());await onDone()
  }catch(e){setError(contentError(e))}finally{setBusy(false)}}
  return <form className="comment-form" onSubmit={save}><fieldset disabled={busy}><label htmlFor={inputId}>{label}</label>{!initial&&<p className="muted">{selected?`${selected.name}의 모습으로 작성합니다.`:<Link to="/characters">먼저 캐릭터를 선택해 주세요.</Link>}</p>}
    <textarea id={inputId} value={body} rows={3} onChange={e=>setBody(e.target.value.replace(/\r\n?/g,'\n'))}/><span className="muted">{textLength(body.trim())} / 1,000자</span><div className="actions"><button className="button" disabled={busy||(!initial&&!selected)}>{busy?'저장 중…':initial?'댓글 변경 저장':parentId?'답글 등록':'댓글 등록'}</button>{onCancel&&<button type="button" onClick={onCancel}>취소</button>}</div></fieldset>{error&&<p role="alert" className="form-error">{error}</p>}</form>
}
