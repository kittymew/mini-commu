import {useState,type FormEvent} from 'react'
import {supabase} from '../../lib/supabase'
import {useCharacters} from '../characters/context'
import {Avatar} from '../characters/Avatar'
import {CharacterSelection} from '../characters/CharactersPage'
import {contentError,dateText} from './model'
import {pollSettings,pollJson,type Poll} from './pollModel'
import {PollSettingsFields} from './PollSettingsFields'
export function PollPanel({id,poll,version,reload}:{id:string;poll:Poll;version:number;reload:()=>Promise<void>}){
  const {selected}=useCharacters(),[choiceState,setChoiceState]=useState({key:poll.my_choices.slice().sort().join(),choices:poll.my_choices}),[editing,setEditing]=useState(false),[settings,setSettings]=useState(()=>pollSettings(poll)),[editVersion,setEditVersion]=useState(version),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState(false)
  const choiceKey=poll.my_choices.slice().sort().join(),choices=choiceState.key===choiceKey?choiceState.choices:poll.my_choices
  const setChoices=(values:string[])=>setChoiceState({key:choiceKey,choices:values})
  async function act(kind:'vote'|'close'|'edit',e?:FormEvent){e?.preventDefault();setBusy(true);setError('');try{const r=kind==='vote'?await supabase!.rpc('submit_vote',{target_id:id,character_id:selected!.id,option_ids:choices}):kind==='close'?await supabase!.rpc('close_poll',{target_id:id}):await supabase!.rpc('update_poll',{target_id:id,expected_version:editVersion,settings:pollJson(settings)});if(r.error)throw r.error;setEditing(false);setConfirm(false);await reload()}catch(e){setError(contentError(e));await reload()}finally{setBusy(false)}}
  const allowed=!poll.closed&&(!poll.has_voted||poll.allow_revote)
  return <section className="poll-panel" aria-label="투표"><h2>{poll.question}</h2><p>{poll.anonymous?'익명':'기명'} · {poll.multiple?'복수 선택':'단일 선택'} · {poll.allow_revote?'재투표 가능':'재투표 불가'} · {poll.closed?'마감됨':poll.closes_at?`${dateText(poll.closes_at)} 마감`:'마감 없음'}</p>
    {allowed&&<CharacterSelection/>}<form onSubmit={e=>void act('vote',e)}><fieldset disabled={!allowed||busy}><legend>투표 선택</legend>{poll.options.map(o=><label className="check-label" key={o.id}><input type={poll.multiple?'checkbox':'radio'} name="poll-choice" value={o.id} checked={choices.includes(o.id)} onChange={e=>setChoices(poll.multiple?e.target.checked?[...choices,o.id]:choices.filter(x=>x!==o.id):[o.id])}/>{o.text}</label>)}{allowed&&<button className="button" disabled={busy||!selected||!choices.length}>{poll.has_voted?'재투표':'투표하기'}</button>}</fieldset></form>
    {poll.has_voted&&<p role="status">참여한 투표입니다.</p>}{!poll.results_visible?<p>결과는 {poll.results_policy==='after_close'?'마감 후':'참여 후'} 공개됩니다.</p>:<div className="poll-results"><h3>투표 결과 · {poll.participants}명 참여</h3>{poll.options.map(o=><div key={o.id}><p>{o.text} · {o.count}표 ({poll.participants?Math.round(o.count!*1000/poll.participants)/10:0}%)</p><progress max={poll.participants||1} value={o.count??0} aria-label={`${o.text} 득표 비율`}/></div>)}{poll.multiple&&<p className="muted">비율은 참여 계정 수 기준이며, 복수 선택의 합계는 100%를 넘을 수 있습니다.</p>}{!poll.anonymous&&poll.voters.map((v,i)=><div className="author-line" key={i}><Avatar assetId={v.avatar_asset_id} name={v.name}/><span>{v.name} · {v.choices.map(id=>poll.options.find(o=>o.id===id)?.text).join(', ')}</span></div>)}</div>}
    {poll.can_edit_settings&&!editing&&<button onClick={()=>{setSettings(pollSettings(poll));setEditVersion(version);setEditing(true)}}>투표 설정 수정</button>}{editing&&<form onSubmit={e=>void act('edit',e)}><fieldset disabled={busy||!poll.can_edit_settings}><PollSettingsFields value={settings} onChange={setSettings}/><button className="button">투표 설정 저장</button><button type="button" onClick={()=>setEditing(false)}>취소</button></fieldset></form>}
    {poll.can_close&&<button disabled={busy} onClick={()=>setConfirm(true)}>투표 조기 마감</button>}{confirm&&<div className="delete-confirm"><p>마감한 투표는 다시 열 수 없습니다. 마감할까요?</p><button disabled={busy} onClick={()=>void act('close')}>마감 확정</button><button onClick={()=>setConfirm(false)}>취소</button></div>}{error&&<p role="alert">{error}</p>}
  </section>
}
