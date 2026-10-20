import {useEffect,useRef,useState,type FormEvent} from 'react'
import {Link,useNavigate,useParams} from 'react-router'
import {supabase} from '../../lib/supabase'
import {getAuthState,useAuth} from '../auth/auth'
import {useCharacters} from '../characters/context'
import {CharacterSelection} from '../characters/CharactersPage'
import {Avatar} from '../characters/Avatar'
import {categories,contentError,emptyDocument,getPost,jsonDocument,plainText,textLength,validDocument,type Category,type Document,type Post} from './model'
import {useResource} from './useResource'
import {RichEditor,RichText} from './RichText'
import {ImageGallery} from './Images'
import {AttachmentPicker} from './AttachmentPicker'
type Draft={title:string;document:Document;category:string;images:string[];requestId:string;savedAt:string}
function readDraft(key:string){try{const d=JSON.parse(localStorage.getItem(key)||'null');return d&&typeof d.title==='string'&&typeof d.category==='string'&&typeof d.requestId==='string'&&/^[0-9a-f-]{36}$/i.test(d.requestId)&&validDocument(d.document)&&Array.isArray(d.images)&&d.images.length<=4&&d.images.every((x:unknown)=>typeof x==='string')?d as Draft:null}catch{return null}}
export default function PostEditor(){
  const {postId}=useParams(),resource=useResource(`editor:${postId??'new'}`,async()=>({categories:await categories(),post:postId?await getPost(postId):null}))
  if(resource.loading)return <p role="status">작성 화면을 준비하고 있어요…</p>
  if(resource.error)return <div role="alert">{resource.error}<button onClick={()=>void resource.reload()}>다시 시도</button></div>
  if(!resource.data||(postId&&(!resource.data.post||!resource.data.post.can_edit)))return <section className="card placeholder"><h1>수정할 수 없는 글입니다</h1><Link to="/feed">피드로</Link></section>
  return <EditorForm key={postId??'new'} initial={resource.data.post} categoryList={resource.data.categories}/>
}
function EditorForm({initial,categoryList}:{initial:Post|null;categoryList:Category[]}){
  const auth=useAuth(),{selected}=useCharacters(),navigate=useNavigate(),draftKey=`mini-commu:draft:${auth.user!.id}:new`
  const [savedDraft]=useState(()=>initial?null:readDraft(draftKey)),[draftChoice,setDraftChoice]=useState(!savedDraft)
  const [title,setTitle]=useState(initial?.title??''),[document,setDocument]=useState<Document>(initial?.body_json??emptyDocument()),[category,setCategory]=useState(initial?.category_id??categoryList[0]?.id??'')
  const [images,setImages]=useState<string[]>(initial?.image_ids??[]),[requestId,setRequestId]=useState(()=>crypto.randomUUID() as string),[version]=useState(initial?.version)
  const [busy,setBusy]=useState(false),[uploadBlocked,setUploadBlocked]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState(false),[draftStatus,setDraftStatus]=useState(''),[deleteDraft,setDeleteDraft]=useState(false),submitted=useRef(false)
  useEffect(()=>{
    if(initial||!draftChoice||submitted.current)return
    const timer=setTimeout(()=>{
      if(submitted.current||getAuthState().status!=='active'||getAuthState().user?.id!==auth.user?.id)return
      try{if(title||plainText(document)||images.length){localStorage.setItem(draftKey,JSON.stringify({title,document,category,images,requestId,savedAt:new Date().toISOString()}));setDraftStatus('이 기기에 초안을 저장했습니다.')}else{localStorage.removeItem(draftKey);setDraftStatus('저장할 초안이 없습니다.')}}catch{setDraftStatus('이 브라우저에 초안을 저장할 수 없습니다.')}
    },500);return()=>clearTimeout(timer)
  },[initial,draftChoice,title,document,category,images,requestId,draftKey,auth.user?.id])
  function clearDraft(){localStorage.removeItem(draftKey);setTitle('');setDocument(emptyDocument());setImages([]);setRequestId(crypto.randomUUID());setDraftChoice(true);setDeleteDraft(false);setDraftStatus('초안을 삭제했습니다.')}
  async function save(e:FormEvent){
    e.preventDefault();if(busy||uploadBlocked)return
    if(!title.trim()||textLength(title.trim())>100||textLength(plainText(document))>5000){setError('제목은 1~100자, 본문은 5,000자 이내로 입력해 주세요.');return}
    if(!initial&&!selected){setError('작성할 캐릭터를 선택해 주세요.');return}
    setBusy(true);setError('')
    try{
      if(getAuthState().status!=='active'||getAuthState().user?.id!==auth.user?.id)throw new Error('ACTIVE_MEMBER_REQUIRED')
      const payload={category_id:category,post_title:title,document:jsonDocument(document),image_ids:images}
      const result=initial?await supabase!.rpc('update_post',{...payload,target_id:initial.id,expected_version:version!}):await supabase!.rpc('create_post',{...payload,request_id:requestId,character_id:selected!.id})
      if(result.error)throw result.error
      submitted.current=true;if(!initial){try{localStorage.removeItem(draftKey)}catch{/* Saved remotely. */}}
      navigate(`/posts/${initial?.id??requestId}`)
    }catch(e){setError(contentError(e))}finally{setBusy(false)}
  }
  if(!draftChoice&&savedDraft)return <section className="card draft-choice"><h1>저장된 초안이 있어요</h1><p>이 기기에 저장된 글을 이어서 작성할 수 있습니다.</p><p>{savedDraft.title||'제목 없는 초안'}</p><button className="button" onClick={()=>{setTitle(savedDraft.title);setDocument(savedDraft.document);setCategory(savedDraft.category);setImages(savedDraft.images);setRequestId(savedDraft.requestId);setDraftChoice(true)}}>초안 복원</button><button className="button secondary" onClick={clearDraft}>초안 삭제하고 새로 작성</button></section>
  return <section className="post-editor"><h1>{initial?'글 수정':'새 글 작성'}</h1>
    {initial?<div className="author-line"><Avatar assetId={initial.author_avatar_asset_id} name={initial.author_name_snapshot}/><p>{initial.author_name_snapshot}의 작성 당시 모습이 유지됩니다.</p></div>:<CharacterSelection/>}
    {!initial&&!selected&&<p><Link to="/characters">캐릭터를 만들거나 선택해 주세요.</Link></p>}
    <form onSubmit={save}><fieldset disabled={busy}><label htmlFor="post-category">카테고리</label><select id="post-category" value={category} onChange={e=>setCategory(e.target.value)} required><option value="">카테고리를 선택해 주세요</option>{categoryList.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <label htmlFor="post-title">제목</label><input id="post-title" value={title} onChange={e=>setTitle(e.target.value)} required/><span className="muted">{textLength(title.trim())} / 100자</span>
      <RichEditor value={document} onChange={setDocument} disabled={busy}/><AttachmentPicker ids={images} setIds={setImages} onBlocked={setUploadBlocked} disabled={busy}/>
      <div className="actions"><button type="button" className="button secondary" onClick={()=>setPreview(v=>!v)}>{preview?'미리보기 닫기':'등록 전 미리보기'}</button><button className="button" type="submit" disabled={busy||uploadBlocked||(!initial&&!selected)}>{busy?'저장 중…':initial?'변경 저장':'글 등록'}</button><Link to={initial?`/posts/${initial.id}`:'/feed'}>돌아가기</Link></div>
    </fieldset></form>
    {error&&<div className="form-error" role="alert">{error}{initial&&<button type="button" onClick={()=>{if(window.confirm('현재 입력을 버리고 최신 글을 불러올까요?'))window.location.reload()}}>최신 글 다시 불러오기</button>}</div>}
    {!initial&&<div className="draft-status"><p role="status">{draftStatus}</p><button onClick={()=>setDeleteDraft(true)} disabled={busy||uploadBlocked}>초안 삭제</button>{deleteDraft&&<div><p>현재 입력과 저장된 초안을 삭제할까요?</p><button onClick={clearDraft}>초안 삭제 확정</button><button onClick={()=>setDeleteDraft(false)}>계속 작성</button></div>}</div>}
    {preview&&<article className="card post-preview" aria-label="글 미리보기"><span className="eyebrow">등록 전 미리보기</span><h2>{title||'제목 없음'}</h2><p>{categoryList.find(c=>c.id===category)?.name} · {initial?.author_name_snapshot??selected?.name??'캐릭터 미선택'}</p><RichText document={document}/><ImageGallery ids={images}/></article>}
  </section>
}
