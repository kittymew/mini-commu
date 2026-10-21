import {useRef,useState} from 'react'
import {Link} from 'react-router'
import {supabase} from '../../lib/supabase'
import {useCharacters} from '../characters/context'
import {dateText} from './model'
import {useResource} from './useResource'
type Activity={id:string;post_id:string;text:string;author_character_id:string;author_name_snapshot:string;created_at:string}
export default function ActivityPage(){
  const {items:characters}=useCharacters(),[kind,setKind]=useState('post'),[character,setCharacter]=useState(''),pages=useRef(1),[busy,setBusy]=useState(false)
  const resource=useResource(`activity:${kind}:${character}`,async()=>{const historical=await supabase!.rpc('list_activity_characters');if(historical.error)throw historical.error;const items:Activity[]=[];let more=false;for(let page=0;page<pages.current;page++){const last=items.at(-1),r=await supabase!.rpc('list_my_activity',{kind_filter:kind,character_filter:character||undefined,before_time:last?.created_at,before_id:last?.id});if(r.error)throw r.error;const rows=r.data as unknown as Activity[];items.push(...rows);more=rows.length===20;if(!more)break}return {items,more,historical:historical.data as unknown as {id:string;name:string}[]}})
  return <><h1>내 활동</h1><p>현재 선택한 캐릭터와 관계없이 내 계정으로 작성한 글과 댓글입니다.</p><div className="feed-filters"><label>활동 종류<select aria-label="활동 종류" value={kind} onChange={e=>{pages.current=1;setKind(e.target.value)}}><option value="post">내 글</option><option value="comment">내 댓글</option></select></label><label>작성 캐릭터<select aria-label="작성 캐릭터" value={character} onChange={e=>{pages.current=1;setCharacter(e.target.value)}}><option value="">전체 캐릭터</option>{characters.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}{resource.data?.historical.filter(v=>!characters.some(c=>c.id===v.id)).map(v=><option key={v.id} value={v.id}>{v.name} (이전 모습)</option>)}</select></label></div>
    {resource.loading&&<p role="status">활동을 불러오고 있어요…</p>}{resource.error&&<p role="alert">{resource.error}<button onClick={()=>void resource.reload()}>다시 시도</button></p>}{resource.data&&!resource.data.items.length&&<p>표시할 활동이 없습니다.</p>}
    {resource.data?.items.map(item=><article className="card activity-card" key={item.id}><h2><Link to={`/posts/${item.post_id}`}>{item.text}</Link></h2><p>{item.author_name_snapshot} · {dateText(item.created_at)}</p></article>)}{resource.data?.more&&<button disabled={busy} onClick={()=>{setBusy(true);pages.current++;void resource.reload().finally(()=>setBusy(false))}}>활동 더 불러오기</button>}
  </>
}
