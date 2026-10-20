import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
export function Avatar({ assetId, name }: { assetId: string|null; name: string }) {
  const [image,setImage]=useState<{id:string;url:string}|null>(null)
  useEffect(()=>{
    if(!assetId || !supabase)return
    let disposed=false, objectUrl=''
    const client=supabase
    void (async()=>{
      const paths=await client.rpc('get_asset_paths',{asset_ids:[assetId]})
      const path=paths.data?.[0]?.thumbnail_path
      if(!path || disposed)return
      const file=await client.storage.from('community').download(path)
      if(!file.data || disposed)return
      objectUrl=URL.createObjectURL(file.data)
      setImage({id:assetId,url:objectUrl})
    })().catch(()=>{})
    return ()=>{disposed=true;if(objectUrl)URL.revokeObjectURL(objectUrl)}
  },[assetId])
  return image?.id===assetId ? <img className="character-avatar" src={image.url} alt={`${name} 프로필`} /> : <span className="character-avatar avatar-initial" aria-label={`${name} 기본 프로필`}>{Array.from(name)[0] || '?'}</span>
}
