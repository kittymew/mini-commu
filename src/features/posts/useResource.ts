import {useCallback,useEffect,useRef,useState} from 'react'
import {getAuthState,useAuth} from '../auth/auth'
import {contentError} from './model'
export function useResource<T>(key:string,fetcher:()=>Promise<T>){
  const auth=useAuth(),userId=auth.user?.id
  const [state,setState]=useState<{key:string;user?:string;data:T|null;error:string;loading:boolean;revision:number}>({key:'',data:null,error:'',loading:true,revision:0})
  const fetchRef=useRef(fetcher),generation=useRef({value:0})
  useEffect(()=>{fetchRef.current=fetcher})
  const reload=useCallback(async()=>{
    const version=++generation.current.value
    try{const data=await fetchRef.current();if(version===generation.current.value&&getAuthState().status==='active'&&getAuthState().user?.id===userId)setState({key,user:userId,data,error:'',loading:false,revision:version})}
    catch(e){if(version===generation.current.value&&getAuthState().user?.id===userId)setState({key,user:userId,data:null,error:contentError(e),loading:false,revision:version})}
  },[key,userId])
  useEffect(()=>{
    const counter=generation.current
    const initial=setTimeout(()=>void reload(),0),refresh=()=>{if(!document.hidden)void reload()},interval=setInterval(refresh,15000)
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh)
    return()=>{counter.value++;clearTimeout(initial);clearInterval(interval);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)}
  },[reload])
  return {revision:state.revision,data:state.key===key&&state.user===userId?state.data:null,error:state.key===key&&state.user===userId?state.error:'',loading:state.key!==key||state.user!==userId||state.loading,reload}
}
