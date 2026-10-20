import {useRef,useState,type ReactNode} from 'react'
import {type Block,type Document,type Mark,type TextNode,plainText,safeLink,textLength} from './model'
export function RichText({document}:{document:Document}){
  const inline=(block:Block)=>block.content.map((n,i)=>{
    let text:ReactNode=n.text
    for(const m of n.marks??[]){if(m.type==='bold')text=<strong>{text}</strong>;else if(m.type==='italic')text=<em>{text}</em>;else if(m.type==='link'&&safeLink(m.href))text=<a href={m.href} target="_blank" rel="noopener noreferrer">{text}</a>}
    return <span key={i}>{text}</span>
  })
  const groups:ReactNode[]=[]
  for(let i=0;i<document.content.length;i++){
    const b=document.content[i]
    if(b.type==='paragraph')groups.push(<p key={i}>{inline(b)||<br/>}</p>)
    else{const start=i,items=[];do{items.push(<li key={i}>{inline(document.content[i])}</li>);i++}while(i<document.content.length&&document.content[i].type===b.type);i--;groups.push(b.type==='bullet'?<ul key={start}>{items}</ul>:<ol key={start}>{items}</ol>)}
  }
  return <div className="rich-content">{groups}</div>
}
function slice(nodes:TextNode[],start:number,end:number){let offset=0;const out:TextNode[]=[];for(const n of nodes){const a=Math.max(start-offset,0),b=Math.min(end-offset,n.text.length);if(b>a)out.push({...n,text:n.text.slice(a,b)});offset+=n.text.length}return out}
export function RichEditor({value,onChange,disabled}:{value:Document;onChange:(v:Document)=>void;disabled:boolean}){
  const refs=useRef<(HTMLTextAreaElement|null)[]>([]),[active,setActive]=useState(0),[error,setError]=useState('')
  function changeBlock(index:number,block:Block){onChange({...value,content:value.content.map((b,i)=>i===index?block:b)})}
  function format(type:Mark['type']){
    const field=refs.current[active],block=value.content[active];if(!field||!block)return
    const start=field.selectionStart,end=field.selectionEnd
    if(start===end){setError('서식을 적용할 글자를 먼저 선택해 주세요.');return}
    let mark:Mark
    if(type==='link'){const href=window.prompt('연결할 http 또는 https 주소');if(href===null)return;if(!safeLink(href)){setError('http 또는 https 주소를 입력해 주세요.');return}mark={type,href}}
    else mark={type}
    const middle=slice(block.content,start,end),remove=type!=='link'&&middle.every(n=>n.marks?.some(m=>m.type===type))
    const nodes=middle.map(n=>({...n,marks:[...(n.marks??[]).filter(m=>m.type!==type),...(remove?[]:[mark])]}))
    changeBlock(active,{...block,content:[...slice(block.content,0,start),...nodes,...slice(block.content,end,Infinity)]});setError('');field.focus()
  }
  return <div className="rich-editor"><div className="editor-toolbar" aria-label="본문 서식"><button type="button" disabled={disabled} onClick={()=>format('bold')}>굵게</button><button type="button" disabled={disabled} onClick={()=>format('italic')}>기울임</button><button type="button" disabled={disabled} onClick={()=>format('link')}>링크</button></div>
    {value.content.map((block,i)=>{const text=block.content.map(n=>n.text).join('');return <div className="editor-block" key={i}>
      <label htmlFor={`block-kind-${i}`}>문단 {i+1} 형식</label><select id={`block-kind-${i}`} disabled={disabled} value={block.type} onChange={e=>changeBlock(i,{...block,type:e.target.value as Block['type']})}><option value="paragraph">본문</option><option value="bullet">글머리 목록</option><option value="ordered">번호 목록</option></select>
      <label htmlFor={`block-text-${i}`}>본문 {i+1}</label><textarea id={`block-text-${i}`} rows={4} disabled={disabled} ref={node=>{refs.current[i]=node}} value={text} onFocus={()=>setActive(i)} onPaste={e=>{if(Array.from(e.clipboardData.items).some(item=>item.type.startsWith('image/'))){e.preventDefault();setError('이미지는 아래 첨부 영역에서 추가해 주세요.')}}} onChange={e=>{
        const next=e.target.value.replace(/\r\n?/g,'\n');let prefix=0,suffix=0;while(prefix<text.length&&prefix<next.length&&text[prefix]===next[prefix])prefix++;while(suffix<text.length-prefix&&suffix<next.length-prefix&&text[text.length-1-suffix]===next[next.length-1-suffix])suffix++
        const inserted=next.slice(prefix,next.length-suffix),nodes=[...slice(block.content,0,prefix),...(inserted?[{type:'text' as const,text:inserted,marks:slice(block.content,Math.max(0,prefix-1),prefix)[0]?.marks}]:[]),...slice(block.content,text.length-suffix,Infinity)];changeBlock(i,{...block,content:nodes})
      }}/><button type="button" disabled={disabled||value.content.length===1} onClick={()=>{onChange({...value,content:value.content.filter((_,n)=>n!==i)});setActive(0)}}>문단 {i+1} 삭제</button>
    </div>})}
    <button type="button" disabled={disabled||value.content.length>=100} onClick={()=>onChange({...value,content:[...value.content,{type:'paragraph',content:[]}]})}>문단 추가</button><p className="muted">{textLength(plainText(value))} / 5,000자 · 글자를 선택한 뒤 서식을 적용하세요.</p>{error&&<p role="alert">{error}</p>}
  </div>
}
