import { createClient } from '@supabase/supabase-js'
import { processProfile } from './image.mjs'
import { profileLimits } from './limits.mjs'

export function createProfileHandler({ url, publicKey, serviceKey, origins }) {
  const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
  return async request => {
    const origin=request.headers.get('origin')
    const headers={ 'Content-Type':'application/json', 'Cache-Control':'no-store', 'Vary':'Origin', 'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods':'POST,OPTIONS' }
    if (origin && origins.includes(origin)) headers['Access-Control-Allow-Origin']=origin
    const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers})
    if (origin && !origins.includes(origin)) return reply(403,{error:'ORIGIN_DENIED'})
    if (request.method==='OPTIONS') return new Response(null,{status:204,headers})
    if (request.method!=='POST') return reply(405,{error:'METHOD_NOT_ALLOWED'})
    const authorization=request.headers.get('authorization') ?? ''
    if (!authorization.startsWith('Bearer ')) return reply(401,{error:'AUTH_REQUIRED'})
    const client=createClient(url,publicKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}})
    let assetId, userId
    const paths=[]
    try {
      const {data:{user},error}=await client.auth.getUser(authorization.slice(7))
      if (error || !user) return reply(401,{error:'AUTH_REQUIRED'})
      userId=user.id
      const reserved=await client.rpc('reserve_profile_asset')
      if (reserved.error) return reply(reserved.error.message==='UPLOAD_RATE_LIMIT'?429:403,{error:reserved.error.message==='UPLOAD_RATE_LIMIT'?'UPLOAD_RATE_LIMIT':'ACTIVE_MEMBER_REQUIRED'})
      assetId=reserved.data
      const mime=(request.headers.get('content-type')??'').split(';')[0]
      if (!['image/jpeg','image/png','image/webp'].includes(mime)) throw new Error('INVALID_IMAGE')
      if (Number(request.headers.get('content-length'))>profileLimits.inputBytes) throw new Error('IMAGE_TOO_LARGE')
      const reader=request.body?.getReader()
      if (!reader) throw new Error('INVALID_IMAGE')
      const chunks=[]; let size=0
      try {
        for (;;) {
          const {value,done}=await reader.read()
          if (done) break
          size+=value.length
          if (size>profileLimits.inputBytes) throw new Error('IMAGE_TOO_LARGE')
          chunks.push(value)
        }
      } finally { await reader.cancel().catch(()=>{}) }
      const bytes=new Uint8Array(size); let offset=0
      for (const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.length}
      const {main,thumbnail}=processProfile(bytes,mime)
      for (const [name,data] of [['main',main],['thumb',thumbnail]]) {
        const path=`profiles/${assetId}/${name}.webp`
        const upload=await admin.storage.from('community').upload(path,data,{contentType:'image/webp',cacheControl:'60',upsert:false})
        if (upload.error) throw new Error('UPLOAD_FAILED')
        paths.push(path)
      }
      const result=await admin.rpc('finalize_profile_asset',{target_id:assetId,owner_id:userId,stored_bytes:main.length+thumbnail.length,accepted:true})
      if (result.error) throw new Error('UPLOAD_FAILED')
      return reply(200,{assetId})
    } catch(error) {
      if (paths.length) await admin.storage.from('community').remove(paths)
      if (assetId) await admin.rpc('finalize_profile_asset',{target_id:assetId,owner_id:userId,stored_bytes:1,accepted:false})
      const known=['IMAGE_TOO_LARGE','IMAGE_DIMENSIONS','ANIMATED_IMAGE','INVALID_IMAGE','UPLOAD_FAILED']
      const code=known.includes(error?.message)?error.message:'INVALID_IMAGE'
      return reply(code==='UPLOAD_FAILED'?503:code==='IMAGE_TOO_LARGE'?413:400,{error:code})
    }
  }
}
