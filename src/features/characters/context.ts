import { createContext, useContext } from 'react'
import type { Database } from '../../types/database'
export type Character = Database['public']['Tables']['characters']['Row']
export type CharactersState = { items: Character[]; selected: Character | null; loading: boolean; error: string; reload: () => Promise<void>; select: (id: string | null) => void }
export const CharactersContext = createContext<CharactersState>({ items: [], selected: null, loading: false, error: '', reload: async () => {}, select: () => {} })
export const useCharacters = () => useContext(CharactersContext)
export function characterError(error: unknown) {
  const code = typeof error === 'object' && error && 'message' in error ? String(error.message) : ''
  return ({ CHARACTER_LIMIT: '사용 중인 캐릭터는 최대 6개입니다. 다른 캐릭터를 중지하거나 삭제해 주세요.', CHARACTER_CONFLICT: '다른 곳에서 변경된 캐릭터입니다. 목록을 새로고침한 뒤 다시 수정해 주세요.', CHARACTER_NOT_OWNED: '이 캐릭터를 변경할 수 없습니다. 목록을 새로고침해 주세요.', CHARACTER_DELETED: '삭제된 캐릭터는 다시 사용할 수 없습니다.', INVALID_INPUT: '이름과 소개의 길이를 확인해 주세요.', INVALID_AVATAR: '사용할 수 없는 프로필 이미지입니다. 다시 올려 주세요.', ACTIVE_MEMBER_REQUIRED: '회원 상태를 확인해 주세요. 다시 로그인해야 할 수 있습니다.', UPLOAD_RATE_LIMIT: '이미지 업로드 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.', IMAGE_TOO_LARGE: '이미지가 너무 큽니다. 10 MiB 이하의 파일을 선택해 주세요.', IMAGE_DIMENSIONS: '이미지는 1,200만 화소, 가로·세로 8,192px 이내로 줄여 주세요.', ANIMATED_IMAGE: '움직이는 이미지는 사용할 수 없습니다.', INVALID_IMAGE: '정상적인 JPEG, PNG, WebP 파일을 선택해 주세요.' } as Record<string,string>)[code] ?? '요청을 완료하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.'
}
