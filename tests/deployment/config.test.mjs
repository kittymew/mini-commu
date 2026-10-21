import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {spawnSync} from 'node:child_process'
import {pagesUrl,validatePagesEnv} from '../../scripts/validate-pages-env.mjs'
const valid = {VITE_SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test_public_only',VITE_SITE_URL:pagesUrl}
test('production accepts the hosted backend and exact repository URL',()=>assert.deepEqual(validatePagesEnv(valid),[]))
test('missing deployment configuration fails closed',()=>assert.equal(validatePagesEnv({}).length,3))
test('secret and legacy JWT keys cannot enter the production build',()=>{
  for(const key of ['sb_secret_private','eyJhbGciOiJIUzI1NiJ9.payload.signature','', 'sb_publishable_']) assert.ok(validatePagesEnv({...valid,VITE_SUPABASE_PUBLISHABLE_KEY:key}).length)
})
test('localhost, insecure endpoints and unrelated hosts are rejected',()=>{
  for(const url of ['http://abcdefghijklmnopqrst.supabase.co','https://127.0.0.1','https://example.com','https://abcdefghijklmnopqrst.supabase.co.evil.test']) assert.ok(validatePagesEnv({...valid,VITE_SUPABASE_URL:url}).length)
})
test('backend credentials, ports, paths, queries and fragments are rejected',()=>{
  for(const url of ['https://user:password@abcdefghijklmnopqrst.supabase.co','https://abcdefghijklmnopqrst.supabase.co:444','https://abcdefghijklmnopqrst.supabase.co/rest/v1','https://abcdefghijklmnopqrst.supabase.co/?token=private','https://abcdefghijklmnopqrst.supabase.co/#private']) assert.ok(validatePagesEnv({...valid,VITE_SUPABASE_URL:url}).length)
})
test('callback base requires the exact project subpath, no query or hash',()=>{
  for(const url of ['https://kittymew.github.io/','https://kittymew.github.io/mini-commu','http://kittymew.github.io/mini-commu/',`${pagesUrl}#/feed`,`${pagesUrl}?code=secret`]) assert.ok(validatePagesEnv({...valid,VITE_SITE_URL:url}).length)
})
test('production rejects upload overrides and undocumented VITE secrets',()=>{
  for(const key of ['VITE_PROFILE_UPLOAD_URL','VITE_POST_UPLOAD_URL','VITE_SERVICE_ROLE_KEY']) assert.ok(validatePagesEnv({...valid,[key]:'private-value'}).length)
  assert.deepEqual(validatePagesEnv({...valid,CI:'true'}),[])
})
test('CLI exits nonzero without printing rejected secret values',()=>{
  const secret='sb_secret_must_not_appear_in_logs',r=spawnSync(process.execPath,['scripts/validate-pages-env.mjs'],{env:{...process.env,...valid,VITE_SUPABASE_PUBLISHABLE_KEY:secret},encoding:'utf8'})
  assert.equal(r.status,1);assert.ok(!`${r.stdout}${r.stderr}`.includes(secret));assert.match(r.stderr,/publishable key required/)
})

test('CLI checks production dotenv files before Vite can expose extra public variables',()=>{
  const directory=mkdtempSync(join(tmpdir(),'mini-commu-pages-')),secret='sb_secret_dotenv_must_not_escape'
  try {
    writeFileSync(join(directory,'.env.production'),`VITE_PRIVATE_BACKEND_KEY=${secret}\n`)
    const r=spawnSync(process.execPath,[resolve('scripts/validate-pages-env.mjs')],{cwd:directory,env:{...process.env,...valid},encoding:'utf8'})
    assert.equal(r.status,1);assert.match(r.stderr,/Unexpected VITE_/);assert.ok(!`${r.stdout}${r.stderr}`.includes(secret))
  } finally {rmSync(directory,{recursive:true,force:true})}
})
