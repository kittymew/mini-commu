import { Link } from 'react-router'
import { CharacterSelection } from './CharactersPage'
import { useCharacters } from './context'
export function WritingCharacter() {
  const {selected,error,reload}=useCharacters()
  return <section className="card character-form"><h2>작성할 캐릭터</h2><CharacterSelection />{error ? <><p role="alert">{error}</p><button onClick={()=>void reload()}>다시 시도</button></> : selected ? <p>{selected.name}의 이름과 프로필로 작성할 준비가 되었어요.</p> : <p>글을 쓰기 전에 <Link to="/characters">캐릭터를 만들거나 선택</Link>해 주세요.</p>}</section>
}
