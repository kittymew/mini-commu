export function createProfileHandler(options:{url:string;publicKey:string;serviceKey:string;origins:string[];kind?:'profile'|'post'}):(request:Request)=>Promise<Response>
