import {createClient} from '@supabase/supabase-js'
import {localConfig} from './local-db.mjs'
const local=process.argv.includes('--local'),apply=process.argv.includes('--apply')
const env=local?localConfig():null
const url=env?.API_URL??process.env.SUPABASE_URL,key=env?.SERVICE_ROLE_KEY??process.env.SUPABASE_SECRET_KEY
if(!url||!key)throw new Error('Use --local, or set server-only SUPABASE_URL and SUPABASE_SECRET_KEY')
const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
let count=0
for(let batch=0;batch<10;batch++){
  const r=await client.rpc('claim_unused_assets',{apply_changes:apply});if(r.error)throw new Error(r.error.message)
  if(!apply){console.log(`Dry run: ${r.data.length} unreferenced assets older than 24h (up to 100 per batch). Nothing removed.`);break}
  if(!r.data.length)break
  for(const asset of r.data){
    const files=[asset.storage_path,asset.thumbnail_path,asset.temporary_path].filter(Boolean)
    const removed=await client.storage.from('community').remove(files);if(removed.error)throw new Error(`Storage removal failed for asset ${asset.id}; next run will retry.`)
    const done=await client.rpc('finish_asset_cleanup',{target_id:asset.id});if(done.error)throw new Error(`Cleanup finalization failed for asset ${asset.id}; next run will retry.`)
    count++
  }
}
if(apply)console.log(`Removed ${count} unreferenced assets. Maximum 1,000 per run; run again if needed.`)
