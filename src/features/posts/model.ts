import type {Database,Json} from '../../types/database'
import {supabase} from '../../lib/supabase'
export type Mark={type:'bold'|'italic'}|{type:'link';href:string}
export type TextNode={type:'text';text:string;marks?:Mark[]}
export type Block={type:'paragraph'|'bullet'|'ordered';content:TextNode[]}
export type Document={type:'doc';content:Block[]}
export type Category=Database['public']['Tables']['categories']['Row']
export type FeedPost=Database['public']['Functions']['list_posts']['Returns'][number]
export type Comment=Database['public']['Functions']['list_comments']['Returns'][number]
export type Post={id:string;category_id:string;type:string;title:string;body_json:Document;body_text:string;author_character_id:string;author_name_snapshot:string;author_avatar_asset_id:string|null;created_at:string;updated_at:string;version:number;can_edit:boolean;image_ids:string[];comment_count:number}
export const emptyDocument=():Document=>({type:'doc',content:[{type:'paragraph',content:[]}]})
export const plainText=(doc:Document)=>doc.content.map(b=>b.content.map(n=>n.text).join('')).join('\n')
export const textLength=(text:string)=>Array.from(text).length
export const jsonDocument=(doc:Document)=>doc as unknown as Json
export function safeLink(value:string){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!Array.from(value).some(c=>c.charCodeAt(0)<32||/\s/u.test(c))}catch{return false}}
export function validDocument(value:unknown):value is Document{
  if(!value||typeof value!=='object')return false
  const d=value as Document
  return d.type==='doc'&&Array.isArray(d.content)&&d.content.length<=100&&d.content.every(b=>b&&['paragraph','bullet','ordered'].includes(b.type)&&Array.isArray(b.content)&&b.content.length<=200&&b.content.every(n=>n?.type==='text'&&typeof n.text==='string'&&(!n.marks||(Array.isArray(n.marks)&&n.marks.length<=3&&n.marks.every(m=>m&&(['bold','italic'].includes(m.type)||(m.type==='link'&&safeLink(m.href))))))))
}
export function contentError(error:unknown){
  const code=error&&typeof error==='object'&&'message'in error?String(error.message):''
  return ({CONTENT_CONFLICT:'다른 곳에서 변경되었습니다. 입력은 유지했습니다. 최신 내용을 확인한 뒤 다시 수정해 주세요.',CONTENT_NOT_OWNED:'본인이 작성한 내용만 변경할 수 있습니다.',CONTENT_UNAVAILABLE:'삭제되었거나 볼 수 없는 글입니다.',INVALID_CATEGORY:'카테고리를 다시 선택해 주세요.',CATEGORY_DESTINATION_REQUIRED:'글을 옮길 카테고리를 선택해 주세요.',LAST_CATEGORY:'마지막 카테고리는 삭제할 수 없습니다.',INVALID_INPUT:'제목과 내용의 글자 수를 확인해 주세요.',BODY_TOO_LONG:'본문은 5,000자까지 입력할 수 있습니다.',INVALID_DOCUMENT:'지원하지 않는 본문 형식입니다.',INVALID_LINK:'링크는 http 또는 https 주소만 사용할 수 있습니다.',IMAGE_LIMIT:'이미지는 중복 없이 최대 4장까지 첨부할 수 있습니다.',INVALID_ASSET:'사용할 수 없는 이미지가 있습니다. 제거한 뒤 다시 올려 주세요.',INVALID_PARENT:'답글을 달 수 없는 댓글입니다. 목록을 새로고침해 주세요.',CHARACTER_NOT_OWNED:'작성할 캐릭터를 다시 선택해 주세요.',CHARACTER_DELETED:'삭제된 캐릭터로 작성할 수 없습니다.',ACTIVE_MEMBER_REQUIRED:'회원 상태를 확인해 주세요.',ADMIN_REQUIRED:'운영자만 사용할 수 있습니다.',UPLOAD_RATE_LIMIT:'이미지 업로드 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.',INVALID_IMAGE:'정상적인 JPEG·PNG·WebP 이미지를 선택해 주세요.',IMAGE_TOO_LARGE:'이미지는 10 MiB 이하여야 합니다.',IMAGE_DIMENSIONS:'이미지를 1,200만 화소, 각 변 8,192px 이하로 줄여 주세요.',ANIMATED_IMAGE:'움직이는 이미지는 사용할 수 없습니다.'} as Record<string,string>)[code]??'요청에 실패했습니다. 입력은 유지됩니다. 연결을 확인하고 다시 시도해 주세요.'
}
export async function categories(){const r=await supabase!.from('categories').select('*').order('sort_order').order('id');if(r.error)throw r.error;return r.data}
export async function getPost(id:string){const r=await supabase!.rpc('get_post',{target_id:id});if(r.error)throw r.error;return r.data as unknown as Post|null}
export const dateText=(value:string)=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'}).format(new Date(value))
