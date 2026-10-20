import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import { getAuthState, useAuth } from '../auth/auth'
import { CharactersContext, characterError, type Character } from './context'

export function CharacterProvider({children}:{children:ReactNode}) {
  const auth=useAuth()
  const userId=auth.status==='active' && !auth.recovery ? auth.user?.id ?? null : null
  const storageKey = `mini-commu:character:${userId}`
  const [items,setItems] = useState<Character[]>([])
  const [selection,setSelection] = useState<{userId:string|null;id:string|null}>({userId:null,id:null})
  const [loadedUserId,setLoadedUserId] = useState<string|null>(null)
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState('')
  const generation = useRef({value:0})
  const select = useCallback((id: string|null) => {
    if (!userId || getAuthState().status!=='active' || getAuthState().user?.id!==userId) return
    setSelection({userId,id})
    try { if (id) localStorage.setItem(storageKey,id); else localStorage.removeItem(storageKey) } catch { /* Selection still works in memory. */ }
  },[storageKey,userId])
  const reload = useCallback(async () => {
    if (!supabase || !userId) { setItems([]);setSelection({userId:null,id:null});setLoadedUserId(null);setLoading(false);setError('');return }
    const version=++generation.current.value
    try {
      const all: Character[]=[]
      for (let offset=0;;offset+=50) {
        const result=await supabase.rpc('list_my_characters',{page_offset:offset})
        if (version!==generation.current.value || getAuthState().status!=='active' || getAuthState().user?.id!==userId) return
        if (result.error) throw result.error
        all.push(...result.data)
        if (result.data.length<50) break
      }
      setItems(all);setError('');setLoading(false);setLoadedUserId(userId)
      setSelection(previous => {
        let id=previous.userId===userId?previous.id:null
        if(previous.userId!==userId){try{id=localStorage.getItem(storageKey)}catch{/* Restricted storage. */}}
        if (id && !all.some(c=>c.id===id && c.status==='active')) {
          try { localStorage.removeItem(storageKey) } catch { /* Ignore restricted storage. */ }
          id=null
        }
        return {userId,id}
      })
    } catch(e) { if(version===generation.current.value && getAuthState().status==='active' && getAuthState().user?.id===userId){setError(characterError(e));setItems([]);setLoading(false);setLoadedUserId(userId)} }
  },[storageKey,userId])
  useEffect(() => {
    const counter=generation.current
    const initial=window.setTimeout(()=>void reload(),0)
    const refresh=()=>{if(!document.hidden)void reload()}
    const storage=(event: StorageEvent)=>{if(userId && event.key===storageKey)setSelection({userId,id:event.newValue})}
    window.addEventListener('focus',refresh);window.addEventListener('storage',storage)
    document.addEventListener('visibilitychange',refresh)
    const timer=window.setInterval(refresh,15000)
    return ()=>{++counter.value;window.clearTimeout(initial);window.clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('storage',storage);document.removeEventListener('visibilitychange',refresh)}
  },[reload,storageKey,userId])
  const visible=Boolean(userId) && loadedUserId===userId
  const selected=visible && selection.userId===userId ? items.find(c=>c.id===selection.id && c.status==='active') ?? null : null
  return <CharactersContext value={{items:visible?items:[],selected,loading:Boolean(userId) && (!visible || loading),error:visible?error:'',reload,select}}>{children}</CharactersContext>
}
