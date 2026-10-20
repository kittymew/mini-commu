import {useState,type FormEvent} from 'react'
import {Link} from 'react-router'
import {supabase} from '../../lib/supabase'
import {categories,contentError,type Category} from './model'
import {useResource} from './useResource'
export default function CategoriesPage(){
  const resource=useResource('categories',categories),[editing,setEditing]=useState<Category|'new'|null>(null),[removing,setRemoving]=useState<Category|null>(null),[moveTo,setMoveTo]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  async function remove(){if(!removing)return;setBusy(true);setError('');try{const r=await supabase!.rpc('delete_category',{target_id:removing.id,expected_version:removing.version,move_to:moveTo||undefined});if(r.error)throw r.error;setRemoving(null);await resource.reload()}catch(e){setError(contentError(e))}finally{setBusy(false)}}
  return <><div className="content-heading"><h1>카테고리 관리</h1><Link to="/feed">피드로</Link></div><p>순서가 작은 카테고리부터 표시됩니다. 글이 있는 분류를 삭제하면 선택한 분류로 함께 이동합니다.</p><button className="button" onClick={()=>setEditing('new')}>카테고리 추가</button>
    {resource.loading&&<p role="status">불러오는 중…</p>}{(resource.error||error)&&<p role="alert">{resource.error||error}<button onClick={()=>void resource.reload()}>목록 새로고침</button></p>}
    {editing&&<CategoryForm key={editing==='new'?'new':editing.id} initial={editing==='new'?null:editing} done={async()=>{setEditing(null);await resource.reload()}} cancel={()=>setEditing(null)}/>}
    <div className="category-list">{resource.data?.map(c=><article className="card" key={c.id} aria-label={`${c.name} 카테고리`}><h2>{c.name}</h2><p>순서 {c.sort_order}</p><button onClick={()=>setEditing(c)}>수정</button><button disabled={(resource.data?.length??0)<=1} onClick={()=>{setRemoving(c);setMoveTo('');setError('')}}>삭제</button></article>)}</div>
    {removing&&<section className="card category-form"><h2>{removing.name} 삭제</h2><label htmlFor="category-destination">기존 글을 옮길 카테고리</label><select id="category-destination" value={moveTo} onChange={e=>setMoveTo(e.target.value)}><option value="">글이 없으면 선택하지 않아도 됩니다</option>{resource.data?.filter(c=>c.id!==removing.id).map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select><button disabled={busy} onClick={()=>void remove()}>카테고리 삭제 확정</button><button disabled={busy} onClick={()=>setRemoving(null)}>취소</button></section>}
  </>
}
function CategoryForm({initial,done,cancel}:{initial:Category|null;done:()=>Promise<void>;cancel:()=>void}){
  const [name,setName]=useState(initial?.name??''),[position,setPosition]=useState(initial?.sort_order??0),[busy,setBusy]=useState(false),[error,setError]=useState('')
  async function save(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{const r=await supabase!.rpc('save_category',{category_name:name,position_value:position,target_id:initial?.id,expected_version:initial?.version});if(r.error)throw r.error;await done()}catch(e){setError(contentError(e))}finally{setBusy(false)}}
  return <form className="card category-form" onSubmit={save}><fieldset disabled={busy}><label htmlFor="category-name">카테고리 이름</label><input id="category-name" required value={name} onChange={e=>setName(e.target.value)}/><label htmlFor="category-position">표시 순서</label><input id="category-position" type="number" min={0} max={10000} value={position} onChange={e=>setPosition(Number(e.target.value))}/><div className="actions"><button className="button">카테고리 저장</button><button type="button" onClick={cancel}>취소</button></div></fieldset>{error&&<p role="alert">{error}</p>}</form>
}
