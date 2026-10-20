import {useState} from 'react'
import {Link,useNavigate,useParams} from 'react-router'
import {supabase} from '../../lib/supabase'
import {useAuth} from '../auth/auth'
import {Avatar} from '../characters/Avatar'
import {CharacterSelection} from '../characters/CharactersPage'
import {categories,contentError,dateText,getPost,type Comment} from './model'
import {useResource} from './useResource'
import {RichText} from './RichText'
import {ImageGallery} from './Images'
import {Comments} from './Comments'
export default function PostPage(){
  const {postId}=useParams(),navigate=useNavigate(),auth=useAuth(),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[moveTo,setMoveTo]=useState('')
  const resource=useResource(`post:${postId}`,async()=>{
    const post=await getPost(postId!);if(!post)return null
    const comments:Comment[]=[]
    for(;;){const last=comments.at(-1),r=await supabase!.rpc('list_comments',{target_post:postId!,after_time:last?.created_at,after_id:last?.id});if(r.error)throw r.error;comments.push(...r.data);if(r.data.length<50)break}
    return {post,comments,categories:await categories()}
  })
  if(resource.loading)return <p role="status">글을 불러오고 있어요…</p>
  if(resource.error)return <div role="alert">{resource.error}<button onClick={()=>void resource.reload()}>다시 시도</button><Link to="/feed">피드로</Link></div>
  if(!resource.data)return <section className="card placeholder"><h1>볼 수 없는 글입니다</h1><p>삭제되었거나 접근할 수 없는 글입니다.</p><Link to="/feed">피드로 돌아가기</Link></section>
  const {post,comments,categories:cats}=resource.data
  async function remove(){setBusy(true);setError('');try{const r=await supabase!.rpc('delete_post',{target_id:post.id,expected_version:post.version});if(r.error)throw r.error;navigate('/feed')}catch(e){setError(contentError(e))}finally{setBusy(false)}}
  async function move(){setBusy(true);setError('');try{const r=await supabase!.rpc('move_post_category',{target_id:post.id,expected_version:post.version,category_id:moveTo});if(r.error)throw r.error;await resource.reload();setNotice('카테고리를 변경했습니다.')}catch(e){setError(contentError(e))}finally{setBusy(false)}}
  return <><article className="card post-detail"><Link to="/feed">← 피드</Link><p className="eyebrow">{cats.find(c=>c.id===post.category_id)?.name}</p><h1>{post.title}</h1><div className="author-line"><Avatar assetId={post.author_avatar_asset_id} name={post.author_name_snapshot}/><div><strong>{post.author_name_snapshot}</strong><p className="muted">{dateText(post.created_at)}{post.version>1?` · 수정됨 ${dateText(post.updated_at)}`:''}</p></div></div><RichText document={post.body_json}/><ImageGallery ids={post.image_ids}/>
    <div className="actions"><button type="button" onClick={()=>void navigator.clipboard.writeText(window.location.href).then(()=>setNotice('링크를 복사했습니다.')).catch(()=>setError('링크를 복사하지 못했습니다. 주소창에서 복사해 주세요.'))}>게시글 링크 복사</button>{post.can_edit&&<><Link to={`/posts/${post.id}/edit`}>글 수정</Link><button onClick={()=>setConfirm(true)}>글 삭제</button></>}</div>
    {confirm&&<div className="delete-confirm"><p>글을 삭제할까요? 글과 댓글을 더 이상 볼 수 없습니다.</p><button disabled={busy} onClick={()=>void remove()}>글 삭제 확정</button><button disabled={busy} onClick={()=>setConfirm(false)}>삭제 취소</button></div>}
    {auth.role==='admin'&&<div className="admin-move"><label htmlFor="move-category">글 이동 카테고리</label><select id="move-category" value={moveTo} onChange={e=>setMoveTo(e.target.value)}><option value="">이동할 곳 선택</option>{cats.filter(c=>c.id!==post.category_id).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><button disabled={!moveTo||busy} onClick={()=>void move()}>카테고리 이동</button></div>}
    {notice&&<p role="status">{notice}</p>}{error&&<p className="form-error" role="alert">{error}<button onClick={()=>void resource.reload()}>최신 글 확인</button></p>}
  </article><CharacterSelection/><Comments postId={post.id} items={comments} reload={resource.reload}/></>
}
