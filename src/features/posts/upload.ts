import {supabase} from '../../lib/supabase'
import {publicEnv} from '../../lib/env'
import {profileLimits} from '../../../supabase/functions/profile-image/limits.mjs'
export async function uploadAttachment(file:File,expectedUserId:string){
  if(file.size>profileLimits.inputBytes)throw new Error('IMAGE_TOO_LARGE')
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('INVALID_IMAGE')
  const session=await supabase!.auth.getSession();if(!session.data.session||session.data.session.user.id!==expectedUserId||!publicEnv.ready)throw new Error('ACTIVE_MEMBER_REQUIRED')
  const response=await fetch(publicEnv.values.postUploadUrl,{method:'POST',headers:{Authorization:`Bearer ${session.data.session.access_token}`,apikey:publicEnv.values.supabaseKey,'Content-Type':file.type},body:file})
  const body=await response.json();if(!response.ok||typeof body.assetId!=='string')throw new Error(body.error??'UPLOAD_FAILED');return body.assetId as string
}
