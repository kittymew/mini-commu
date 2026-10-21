import {useEffect,useRef} from 'react'
import '@fontsource/noto-sans-kr/400.css'
import {RichText} from '../posts/RichText'
import {dateText} from '../posts/model'
import {assetKey,type Author,type Manifest,type Prepared,type Selection} from './model'
export function PrintPreview({prepared,manifest,selection,onReady,onError}:{prepared:Prepared;manifest:Manifest;selection:Selection;onReady:()=>void;onError:()=>void}){
  const root=useRef<HTMLDivElement>(null)
  useEffect(()=>{let disposed=false;const timer=setTimeout(()=>{if(!disposed)onError()},30000);void(async()=>{
    await Promise.all(Array.from(root.current!.querySelectorAll('img'),img=>img.decode()))
    await document.fonts.load('14px "Noto Sans KR"','한글 내보내기');await document.fonts.ready
    if(!document.fonts.check('14px "Noto Sans KR"','한글 내보내기')||Array.from(document.fonts).some(f=>f.family.includes('Noto Sans KR')&&f.status==='error'))throw new Error('font')
    if(!disposed){clearTimeout(timer);onReady()}
  })().catch(()=>{if(!disposed){clearTimeout(timer);onError()}});return()=>{disposed=true;clearTimeout(timer)}},[prepared,onReady,onError])
  const author=(a:Author|null)=>a&&<div className="print-author">{a.avatar_asset_id&&<img src={prepared.assets.get(assetKey(a.avatar_asset_id))!.url} alt={`${a.name}의 작성 당시 모습`}/>}<span>{a.name}</span></div>
  return <><p className="print-guard">이미지와 권한 확인이 필요합니다. 내보내기 화면의 PDF 인쇄 버튼을 사용해 주세요.</p><div className="print-sheet" ref={root} aria-label="인쇄 미리보기"><header className="print-cover"><h1>작은 모임 이야기</h1><p>{prepared.index+1} / {Math.ceil(manifest.total/selection.size)}번째 파일 · 이 파일 {prepared.records.length}개 / 전체 {manifest.total}개</p><p>{selection.from||'시작일 제한 없음'} ~ {selection.until||'종료일 제한 없음'} · 시각 기준: 서울</p><p>댓글 {selection.comments?'포함':'제외'} · 이미지 {selection.images?'포함':'제외'}</p></header>
    {prepared.records.map(({document:p})=><article className="print-post" key={p.id}><header><p>{p.category.name}{p.notice?' · 공지':''}</p><h2>{p.title}</h2>{author(p.author)}<p>{dateText(p.created_at)}{p.updated_at!==p.created_at?` · 수정 ${dateText(p.updated_at)}`:''}</p></header><RichText document={p.body}/>
      {p.images.map(i=><figure key={i.asset_id}><img className="print-attachment" src={prepared.assets.get(assetKey(i.asset_id,true))!.url} alt={`첨부 이미지 ${i.position}`}/><figcaption>첨부 이미지 {i.position}</figcaption></figure>)}
      {p.poll&&<section className="print-poll"><h3>{p.poll.question}</h3><p>{p.poll.anonymous?'익명':'기명'} · {p.poll.multiple?'복수 선택':'단일 선택'} · {p.poll.closed?'마감':'진행 중'}</p>{p.poll.results?<><p>참여 {p.poll.results.participants}명</p><ul>{p.poll.results.options.map(o=><li key={o.id}>{o.text}: {o.count}표 ({p.poll!.results!.participants?Math.round(o.count*1000/p.poll!.results!.participants)/10:0}%)</li>)}</ul>{p.poll.multiple&&<p>참여 계정 수 기준으로 복수 선택 비율 합계는 100%를 넘을 수 있습니다.</p>}{p.poll.results.voters.map((v,i)=><div className="print-voter" key={i}>{author(v)}<p>{v.choices.map(id=>p.poll!.options.find(o=>o.id===id)?.text).join(', ')}</p></div>)}</>:<><ul>{p.poll.options.map(o=><li key={o.id}>{o.text}</li>)}</ul><p>아직 공개되지 않은 투표 결과입니다.</p></>}</section>}
      {selection.comments&&<section className="print-comments"><h3>댓글 {p.comments.filter(c=>!c.deleted).length}</h3>{p.comments.filter(c=>!c.parent_id).map(c=><div key={c.id}><article className="print-comment">{c.deleted?<p>삭제된 댓글입니다.</p>:<><header>{author(c.author)}<p>{dateText(c.created_at)}{c.created_at!==c.updated_at?' · 수정됨':''}</p></header><p className="print-comment-body">{c.body}</p></>}</article>{p.comments.filter(r=>r.parent_id===c.id).map(r=><article className="print-comment print-reply" key={r.id}><header><span>답글</span>{author(r.author)}<p>{dateText(r.created_at)}{r.created_at!==r.updated_at?' · 수정됨':''}</p></header><p className="print-comment-body">{r.body}</p></article>)}</div>)}</section>}
    </article>)}
  </div></>
}
