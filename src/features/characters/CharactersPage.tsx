import { useId,useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { supabase } from '../../lib/supabase'
import { publicEnv } from '../../lib/env'
import { appConfig } from '../../lib/config'
import { profileLimits } from '../../../supabase/functions/profile-image/limits.mjs'
import { getAuthState, useAuth } from '../auth/auth'
import { Avatar } from './Avatar'
import { useCharacters, characterError, type Character } from './context'

async function uploadProfile(file: File) {
  if (!supabase || !publicEnv.ready) throw new Error('UPLOAD_FAILED')
  if(file.size>profileLimits.inputBytes)throw new Error('IMAGE_TOO_LARGE')
  const session=await supabase.auth.getSession()
  if(!session.data.session)throw new Error('ACTIVE_MEMBER_REQUIRED')
  const response=await fetch(publicEnv.values.profileUploadUrl,{method:'POST',headers:{Authorization:`Bearer ${session.data.session.access_token}`,apikey:publicEnv.values.supabaseKey,'Content-Type':file.type},body:file})
  const result=await response.json()
  if(!response.ok || typeof result.assetId!=='string')throw new Error(result.error || 'UPLOAD_FAILED')
  return result.assetId as string
}
function CharacterForm({ character, onClose }: { character?: Character; onClose: (saved: boolean) => void }) {
  const {reload,select}=useCharacters()
  const auth=useAuth()
  const [name,setName]=useState(character?.name ?? '')
  const [bio,setBio]=useState(character?.bio ?? '')
  const [file,setFile]=useState<File|null>(null)
  const [avatar,setAvatar]=useState(character?.avatar_asset_id ?? null)
  const [busy,setBusy]=useState(false)
  const [progress,setProgress]=useState('')
  const [error,setError]=useState('')
  const [requestId]=useState(()=>crypto.randomUUID())
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();if(!supabase || busy)return
    if(Array.from(name.trim()).length<1 || Array.from(name.trim()).length>appConfig.limits.characterNameMax || Array.from(bio).length>appConfig.limits.characterBioMax){setError(characterError(new Error('INVALID_INPUT')));return}
    setBusy(true);setError('')
    try {
      let asset=avatar
      if(file){setProgress('이미지를 확인하고 저장하고 있어요…');asset=await uploadProfile(file);setAvatar(asset);setFile(null)}
      if(getAuthState().status!=='active' || getAuthState().user?.id!==auth.user?.id)throw new Error('ACTIVE_MEMBER_REQUIRED')
      setProgress('캐릭터를 저장하고 있어요…')
      const result=character
        ? await supabase.rpc('update_character',{target_id:character.id,expected_version:character.version,character_name:name,character_bio:bio,avatar_id:asset ?? undefined})
        : await supabase.rpc('create_character',{character_name:name,character_bio:bio,avatar_id:asset ?? undefined,request_id:requestId})
      if(result.error)throw result.error
      await reload()
      if(!character)select(requestId)
      onClose(true)
    } catch(e){setError(characterError(e))} finally{setBusy(false);setProgress('')}
  }
  return <section className="card character-form" aria-labelledby="character-form-title"><h2 id="character-form-title">{character?'캐릭터 수정':'새 캐릭터 만들기'}</h2>
    <form onSubmit={submit}><fieldset disabled={busy}>
      <label htmlFor="character-name">캐릭터 이름</label><input id="character-name" value={name} onChange={e=>setName(e.target.value)} required autoComplete="off" aria-describedby="name-count" /><span id="name-count" className="muted">{Array.from(name.trim()).length} / 30자 · 같은 이름도 사용할 수 있어요</span>
      <label htmlFor="character-bio">소개</label><textarea id="character-bio" value={bio} onChange={e=>setBio(e.target.value.replace(/\r\n?/g,'\n'))} rows={3} aria-describedby="bio-count" /><span id="bio-count" className="muted">{Array.from(bio).length} / 300자</span>
      <div className="avatar-edit"><Avatar assetId={avatar} name={name || '새 캐릭터'} /><div><label>프로필 이미지<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{setFile(e.target.files?.[0]??null);setError('')}} /></label><p className="muted">JPEG·PNG·WebP, 10 MiB 이하. 움직이는 이미지는 제외해 주세요.</p><p className="muted">1,200만 화소, 가로·세로 8,192px 이내</p>{avatar && <button type="button" className="text-button" onClick={()=>{setAvatar(null);setFile(null)}}>기본 이미지로 변경</button>}</div></div>
      <div className="actions"><button type="submit" className="button">{busy?'저장 중…':'저장'}</button><button type="button" className="button secondary" onClick={()=>onClose(false)}>취소</button></div>
    </fieldset></form>{progress && <p role="status">{progress}</p>}{error && <p role="alert" className="form-error">{error}</p>}
    {error && <button type="button" className="text-button" onClick={()=>void reload()}>목록 새로고침</button>}
  </section>
}
export function CharacterSelection() {
  const selectionId=useId()
  const {items,selected,select,loading,error}=useCharacters()
  if(loading)return <p role="status">캐릭터를 확인하고 있어요…</p>
  if(error)return null
  const active=items.filter(c=>c.status==='active')
  return <div className="character-selection"><div className="character-choice"><label htmlFor={selectionId}>현재 캐릭터</label><select id={selectionId} value={selected?.id ?? ''} onChange={e=>select(e.target.value || null)}><option value="">캐릭터를 선택해 주세요</option>{active.map(c=><option key={c.id} value={c.id}>{c.name} · {c.id.slice(0,8)}</option>)}</select></div>{selected && <Avatar assetId={selected.avatar_asset_id} name={selected.name} />}{!active.length && <Link to="/characters">캐릭터 만들기</Link>}</div>
}
export function CharactersPage() {
  const {items,selected,loading,error,reload,select}=useCharacters()
  const [editing,setEditing]=useState<Character|'new'|null>(null)
  const [confirm,setConfirm]=useState<Character|null>(null)
  const [mutationError,setMutationError]=useState('')
  const [notice,setNotice]=useState('')
  const [busy,setBusy]=useState(false)
  const activeCount=items.filter(c=>c.status==='active').length
  async function change(character:Character,status:string) {
    if(!supabase || busy)return
    setBusy(true);setMutationError('');setNotice('')
    try {
      const result=await supabase.rpc('set_character_status',{target_id:character.id,expected_version:character.version,new_status:status})
      if(result.error)throw result.error
      await reload();setConfirm(null)
      setNotice(status==='deleted'?'캐릭터를 삭제했습니다. 과거 작성 기록은 유지됩니다.':status==='disabled'?'캐릭터 사용을 중지했습니다.':'캐릭터를 다시 사용할 수 있습니다.')
    } catch(e){setMutationError(characterError(e))}finally{setBusy(false)}
  }
  return <>
    <section className="character-heading"><div><span className="eyebrow">나의 여러 모습</span><h1>내 캐릭터</h1><p>사용 중 {activeCount} / 6 · 이름을 바꿔도 과거 글에는 그때의 모습이 남아요.</p></div><button className="button" disabled={activeCount>=6 || loading || Boolean(error)} onClick={()=>{setEditing('new');setNotice('')}}>캐릭터 만들기</button></section>
    <CharacterSelection />
    {error && <div className="form-error" role="alert">{error}<button onClick={()=>void reload()}>다시 시도</button></div>}
    {notice && <p className="form-notice" role="status">{notice}</p>}
    {mutationError && <div className="form-error" role="alert">{mutationError}<button onClick={()=>void reload()}>목록 새로고침</button></div>}
    {editing && <CharacterForm key={editing==='new'?'new':`${editing.id}:${editing.version}`} character={editing==='new'?undefined:editing} onClose={saved=>{setEditing(null);if(saved)setNotice('캐릭터를 저장했습니다.')}} />}
    {!loading && !error && !items.length && !editing && <section className="card empty-characters"><h2>첫 캐릭터를 만들어 보세요</h2><p>글과 댓글을 쓸 때 사용할 이름과 모습을 정해 주세요.</p></section>}
    <div className="character-grid">{items.map(c=><article className={`card character-card ${selected?.id===c.id?'selected-character':''}`} key={c.id} aria-label={`${c.name} 캐릭터`}>
      <div className="character-card-header"><Avatar assetId={c.avatar_asset_id} name={c.name} /><div><h2>{c.name}</h2><span className="muted">{c.status==='disabled'?'사용 중지':selected?.id===c.id?'현재 선택됨':'사용 가능'} · {c.id.slice(0,8)}</span></div></div>
      <p className="character-bio">{c.bio || '소개가 아직 없어요.'}</p>
      <div className="character-actions">{c.status==='active' && <button disabled={busy || selected?.id===c.id} onClick={()=>select(c.id)}>{selected?.id===c.id?'선택됨':'이 캐릭터 선택'}</button>}<button disabled={busy} onClick={()=>{setEditing(c);setNotice('')}}>수정</button><button disabled={busy} onClick={()=>void change(c,c.status==='active'?'disabled':'active')}>{c.status==='active'?'사용 중지':'다시 사용'}</button><button disabled={busy} onClick={()=>setConfirm(c)}>삭제</button></div>
      {confirm?.id===c.id && <div className="delete-confirm" role="group" aria-label="캐릭터 삭제 확인"><p>이 캐릭터를 삭제할까요? 되돌릴 수 없으며 과거 글과 댓글은 유지됩니다.</p><button disabled={busy} onClick={()=>void change(c,'deleted')}>삭제 확정</button><button disabled={busy} onClick={()=>setConfirm(null)}>삭제 취소</button></div>}
    </article>)}</div>
  </>
}
