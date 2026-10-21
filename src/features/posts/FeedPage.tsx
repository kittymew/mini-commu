import {useRef,useState} from 'react'
import {Link,useSearchParams} from 'react-router'
import {supabase} from '../../lib/supabase'
import type {Json} from '../../types/database'
import {useAuth} from '../auth/auth'
import {Avatar} from '../characters/Avatar'
import {AssetImage} from './Images'
import {categories,dateText} from './model'
import {useResource} from './useResource'
type Item={id:string;category_id:string;type:string;notice:boolean;pinned:boolean;title:string;excerpt:string;author_character_id:string;author_name_snapshot:string;author_avatar_asset_id:string|null;created_at:string;image_id:string|null;comment_count:number;cursor:Json}
export default function FeedPage(){
  const auth=useAuth(),[params,setParams]=useSearchParams(),[input,setInput]=useState(params.get('q')??''),pageCount=useRef(1),[busy,setBusy]=useState(false)
  const category=params.get('category')??'',type=params.get('type')??'',query=params.get('q')??'',character=params.get('character')??'',notice=params.get('notice')==='1'
  const resource=useResource(`feed:${params}`,async()=>{
    const cats=await categories(),posts:Item[]=[];let hasMore=false
    for(let page=0;page<pageCount.current;page++){
      const r=await supabase!.rpc('browse_posts',{category_filter:category||undefined,type_filter:type||undefined,notice_only:notice,query_text:query,character_filter:character||undefined,cursor:posts.at(-1)?.cursor})
      if(r.error)throw r.error;const items=r.data as unknown as Item[];posts.push(...items);hasMore=items.length===20;if(!hasMore)break
    }
    return {cats,posts,hasMore}
  })
  function filter(key:string,value:string){pageCount.current=1;setParams(previous=>{const next=new URLSearchParams(previous);if(value)next.set(key,value);else next.delete(key);return next})}
  async function more(){setBusy(true);try{pageCount.current++;await resource.reload()}finally{setBusy(false)}}
  const items=resource.data?.posts??[]
  return <><div className="content-heading"><div><span className="eyebrow">함께 쌓는 이야기</span><h1>모임 피드</h1></div><Link className="button" to="/posts/new">글 쓰기</Link></div>
    <div className="feed-filters"><label htmlFor="feed-category">카테고리</label><select id="feed-category" value={category} onChange={e=>filter('category',e.target.value)}><option value="">전체</option>{resource.data?.cats.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><label>글 형식<select aria-label="글 형식" value={type} onChange={e=>filter('type',e.target.value)}><option value="">전체 형식</option><option value="general">일반글</option><option value="poll">투표글</option></select></label><label className="check-label"><input type="checkbox" checked={notice} onChange={e=>filter('notice',e.target.checked?'1':'')}/>공지 모아보기</label>{auth.role==='admin'&&<Link to="/categories">카테고리 관리</Link>}</div>
    <form className="search-form" onSubmit={e=>{e.preventDefault();filter('q',input)}}><label htmlFor="feed-search">제목·본문 검색</label><input id="feed-search" value={input} maxLength={200} onChange={e=>setInput(e.target.value)}/><button className="button">검색</button></form>
    {character&&<p>선택한 캐릭터의 글을 보고 있습니다. <button onClick={()=>filter('character','')}>캐릭터 필터 해제</button></p>}
    {resource.loading&&<p role="status">글을 불러오고 있어요…</p>}{resource.error&&<p role="alert">{resource.error}<button onClick={()=>void resource.reload()}>다시 시도</button></p>}
    {!resource.loading&&!resource.error&&!items.length&&<section className="card empty-characters"><h2>아직 이야기가 없어요</h2><p>조건을 바꾸거나 첫 글을 남겨 보세요.</p></section>}
    <div className="feed-list">{items.map(p=><article className="card feed-card" key={p.id}><div><span className="eyebrow">{resource.data?.cats.find(c=>c.id===p.category_id)?.name}</span>{p.pinned&&<span className="badge">고정</span>}{p.notice&&<span className="badge">공지</span>}{p.type==='poll'&&<span className="badge">투표</span>}<h2><Link to={`/posts/${p.id}`}>{p.title}</Link></h2><p className="feed-excerpt">{p.excerpt}</p><div className="author-line"><Avatar assetId={p.author_avatar_asset_id} name={p.author_name_snapshot}/><span><Link to={`/feed?character=${p.author_character_id}`}>{p.author_name_snapshot}</Link> · {dateText(p.created_at)} · 댓글 {p.comment_count}</span></div></div>{p.image_id&&<Link to={`/posts/${p.id}`} aria-label={`${p.title} 첨부 이미지 보기`}><AssetImage id={p.image_id} alt={`${p.title} 대표 이미지`}/></Link>}</article>)}</div>
    {resource.data?.hasMore&&<button className="button secondary" disabled={busy} onClick={()=>void more()}>{busy?'불러오는 중…':'더 불러오기'}</button>}
  </>
}
