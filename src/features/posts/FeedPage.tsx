import {useRef,useState} from 'react'
import {Link} from 'react-router'
import {supabase} from '../../lib/supabase'
import {useAuth} from '../auth/auth'
import {Avatar} from '../characters/Avatar'
import {AssetImage} from './Images'
import {categories,contentError,dateText,type FeedPost} from './model'
import {useResource} from './useResource'
export default function FeedPage(){
  const auth=useAuth(),[category,setCategory]=useState(''),pageCount=useRef(1),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const resource=useResource(`feed:${category}`,async()=>{
    const cats=await categories(),posts:FeedPost[]=[];let hasMore=false
    for(let page=0;page<pageCount.current;page++){
      const last=posts.at(-1),r=await supabase!.rpc('list_posts',{category_filter:category||undefined,before_time:last?.created_at,before_id:last?.id})
      if(r.error)throw r.error;posts.push(...r.data);hasMore=r.data.length===20;if(!hasMore)break
    }
    return {cats,posts,hasMore}
  })
  const items=resource.data?.posts??[]
  async function more(){setBusy(true);setError('');try{pageCount.current++;await resource.reload()}catch(e){setError(contentError(e))}finally{setBusy(false)}}
  return <><div className="content-heading"><div><span className="eyebrow">함께 쌓는 이야기</span><h1>모임 피드</h1></div><Link className="button" to="/posts/new">글 쓰기</Link></div>
    <div className="feed-filters"><label htmlFor="feed-category">카테고리</label><select id="feed-category" value={category} onChange={e=>{pageCount.current=1;setCategory(e.target.value);setError('')}}><option value="">전체</option>{resource.data?.cats.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>{auth.role==='admin'&&<Link to="/categories">카테고리 관리</Link>}</div>
    {resource.loading&&<p role="status">글을 불러오고 있어요…</p>}{resource.error&&<p role="alert">{resource.error}<button onClick={()=>void resource.reload()}>다시 시도</button></p>}
    {!resource.loading&&!resource.error&&!items.length&&<section className="card empty-characters"><h2>아직 이야기가 없어요</h2><p>첫 글을 남겨 보세요.</p></section>}
    <div className="feed-list">{items.map(p=><article className="card feed-card" key={p.id}><div><span className="eyebrow">{resource.data?.cats.find(c=>c.id===p.category_id)?.name}</span><h2><Link to={`/posts/${p.id}`}>{p.title}</Link></h2><p className="feed-excerpt">{p.excerpt}</p><div className="author-line"><Avatar assetId={p.author_avatar_asset_id} name={p.author_name_snapshot}/><span>{p.author_name_snapshot} · {dateText(p.created_at)} · 댓글 {p.comment_count}</span></div></div>{p.image_id&&<Link to={`/posts/${p.id}`} aria-label={`${p.title} 첨부 이미지 보기`}><AssetImage id={p.image_id} alt={`${p.title} 대표 이미지`}/></Link>}</article>)}</div>
    {resource.data?.hasMore&&<button className="button secondary" disabled={busy} onClick={()=>void more()}>{busy?'불러오는 중…':'더 불러오기'}</button>}{error&&<p role="status">{error}</p>}
  </>
}
