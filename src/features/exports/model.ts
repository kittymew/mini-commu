import type {Document} from '../posts/model'
export type Selection={category:string;from:string;until:string;comments:boolean;images:boolean;size:number;format:'json'|'pdf'}
export type Entry={id:string;created_at:string}
export type Manifest={snapshot_time:string;total:number;items:Entry[]}
export type Author={name:string;avatar_asset_id:string|null}
export type ExportComment={id:string;parent_id:string|null;created_at:string;updated_at:string;deleted:boolean;body:string|null;author:Author|null}
export type ExportPoll={question:string;multiple:boolean;anonymous:boolean;closed:boolean;closes_at:string|null;results_policy:string;options:{id:string;text:string}[];results:null|{participants:number;options:{id:string;text:string;count:number}[];voters:(Author&{choices:string[]})[]}}
export type ExportPost={id:string;type:string;title:string;body:Document;body_text:string;created_at:string;updated_at:string;notice:boolean;category:{id:string;name:string};author:Author;images:{asset_id:string;position:number}[];comments:ExportComment[];poll:ExportPoll|null}
export type RecordItem={document:ExportPost;checksum:string}
export type Asset={path:string;url:string;bytes:Uint8Array<ArrayBuffer>}
export type Prepared={records:RecordItem[];assets:Map<string,Asset>;index:number;release:()=>void}
export const assetKey=(id:string,full=false)=>`${id}:${full?'full':'avatar'}`
export function exportError(e:unknown){const code=e&&typeof e==='object'&&'message'in e?String(e.message):'';return ({EXPORT_CHANGED:'내보내는 동안 글·댓글·투표 또는 공개 상태가 변경되었습니다. 선택 조건을 확인하고 처음부터 다시 준비해 주세요.',EXPORT_TOO_LARGE:'이 분할의 이미지가 64 MiB를 넘습니다. 파일당 글 수를 줄이거나 이미지 포함을 해제해 주세요.',ACTIVE_MEMBER_REQUIRED:'현재 계정으로 내보낼 수 없습니다. 회원 상태를 확인해 주세요.',ASSET_UNAVAILABLE:'이미지를 읽지 못했습니다. 연결과 접근 권한을 확인한 뒤 다시 준비해 주세요.',PRINT_NOT_READY:'이미지 또는 한글 글꼴을 읽지 못했습니다. 다시 준비한 뒤 인쇄해 주세요.',INVALID_EXPORT_RANGE:'시작일과 종료일을 확인해 주세요.'} as Record<string,string>)[code]??'내보내기를 완료하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.'}
