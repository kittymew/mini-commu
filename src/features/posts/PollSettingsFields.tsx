import type {PollSettings} from './pollModel'
function localTime(iso:string|null){if(!iso)return '';const d=new Date(iso);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}
export function PollSettingsFields({value,onChange}:{value:PollSettings;onChange:(v:PollSettings)=>void}){
  const set=<K extends keyof PollSettings>(key:K,v:PollSettings[K])=>onChange({...value,[key]:v})
  return <fieldset className="poll-settings"><legend>투표 설정</legend><label>투표 질문<input value={value.question} onChange={e=>set('question',e.target.value)} required/></label>
    {value.options.map((option,i)=><div className="poll-option-edit" key={i}><label>선택지 {i+1}<input value={option} onChange={e=>set('options',value.options.map((o,j)=>i===j?e.target.value:o))} required/></label><button type="button" disabled={value.options.length<=2} aria-label={`선택지 ${i+1} 제거`} onClick={()=>set('options',value.options.filter((_,j)=>j!==i))}>제거</button></div>)}
    <button type="button" disabled={value.options.length>=10} onClick={()=>set('options',[...value.options,''])}>선택지 추가</button><p className="muted">질문과 선택지는 각각 100자 이내, 선택지는 2~10개입니다.</p>
    <label className="check-label"><input type="checkbox" checked={value.multiple} onChange={e=>set('multiple',e.target.checked)}/>복수 선택</label>
    <label className="check-label"><input type="checkbox" checked={value.anonymous} onChange={e=>set('anonymous',e.target.checked)}/>익명 투표</label>
    <label className="check-label"><input type="checkbox" checked={value.allow_revote} onChange={e=>set('allow_revote',e.target.checked)}/>재투표 허용</label>
    <label>결과 공개<select aria-label="결과 공개" value={value.results_policy} onChange={e=>set('results_policy',e.target.value as PollSettings['results_policy'])}><option value="always">항상 공개</option><option value="after_vote">참여 후 공개</option><option value="after_close">마감 후 공개</option></select></label>
    <label>마감 시각 (기기 시간대)<input type="datetime-local" value={localTime(value.closes_at)} onChange={e=>set('closes_at',e.target.value?new Date(e.target.value).toISOString():null)}/></label><p className="muted">비워 두면 마감 없음. 첫 참여 이후에는 투표 설정을 바꿀 수 없습니다.</p>
  </fieldset>
}
