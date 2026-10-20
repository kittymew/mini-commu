import {useEffect,useRef,useState} from 'react'
import {supabase} from '../../lib/supabase'
export function AssetImage({id,alt,full=false}:{id:string;alt:string;full?:boolean}){
  const [image,setImage]=useState<{key:string;url:string}|null>(null),key=`${id}:${full}`
  useEffect(()=>{
    let disposed=false,url=''
    void(async()=>{const r=await supabase!.rpc('get_asset_paths',{asset_ids:[id]});if(r.error)throw r.error;const asset=r.data[0];if(!asset||disposed)return;const file=await supabase!.storage.from('community').download(full?asset.storage_path:asset.thumbnail_path);if(!file.data||disposed)return;url=URL.createObjectURL(file.data);setImage({key,url})})().catch(()=>{})
    return()=>{disposed=true;if(url)URL.revokeObjectURL(url)}
  },[id,full,key])
  return image?.key===key?<img src={image.url} alt={alt}/>:<span className="image-placeholder" role="img" aria-label={alt}>이미지 확인 중</span>
}
export function ImageGallery({ids}:{ids:string[]}){
  const [opened,setOpened]=useState<string|null>(null),dialog=useRef<HTMLDialogElement>(null)
  useEffect(()=>{if(opened&&!dialog.current?.open)dialog.current?.showModal()},[opened])
  return <><div className="post-images">{ids.map((id,i)=><button key={id} type="button" onClick={()=>setOpened(id)} aria-label={`이미지 ${i+1} 확대`}><AssetImage id={id} alt={`첨부 이미지 ${i+1}`}/></button>)}</div>{opened&&<dialog ref={dialog} className="image-lightbox" aria-label="첨부 이미지 확대" onCancel={()=>setOpened(null)} onClose={()=>setOpened(null)}><button autoFocus type="button" onClick={()=>setOpened(null)}>확대 닫기</button><AssetImage id={opened} alt="확대한 첨부 이미지" full/></dialog>}</>
}
