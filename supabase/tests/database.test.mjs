import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { localConfig, connect, asUser } from '../../scripts/local-db.mjs'

const env = localConfig()
const limits = JSON.parse(readFileSync('shared/limits.json', 'utf8'))
const root = await connect(env)
const auth = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const users = {}
const tokens = {}
const ids = Object.fromEntries(['avatar', 'image', 'hiddenImage', 'pending', 'unused', 'character', 'secondCharacter', 'post', 'hidden', 'deleted', 'comment', 'deletedComment', 'reply', 'poll', 'otherPoll', 'option', 'otherOption', 'vote', 'invite'].map(name => [name, randomUUID()]))
const createdUsers = []
const uploadedObjects = []
const category = '00000000-0000-0000-0000-000000000001'
const password = `Local-test-${randomUUID()}!`

async function api(user, path, options = {}) {
  return fetch(`${env.API_URL}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${user ? tokens[user] : env.ANON_KEY}`, 'Content-Type': 'application/json', ...options.headers },
  })
}
async function denied(user, sql, values = []) {
  await assert.rejects(asUser(env, users[user], sql, values), error => error.code === '42501')
}

before(async () => {
  assert.equal(Number((await root.query('select count(*) from private.members')).rows[0].count), 0,
    'db:test requires an empty local member table; use a disposable local stack')
  for (const name of ['adminA', 'adminB', 'memberA', 'memberB', 'uninvited', 'suspended', 'unverified']) {
    const email = `stage2-${randomUUID()}@example.test`
    const result = await auth.auth.admin.createUser({ email, password, email_confirm: name !== 'unverified' })
    assert.equal(result.error, null)
    users[name] = result.data.user.id
    createdUsers.push(result.data.user.id)
    if (name !== 'unverified') {
      const client = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
      const login = await client.auth.signInWithPassword({ email, password })
      assert.equal(login.error, null)
      tokens[name] = login.data.session.access_token
    }
  }
  for (const name of ['adminA', 'adminB', 'memberA', 'memberB', 'suspended', 'unverified']) {
    await root.query('insert into private.members(user_id,status) values($1,$2)', [users[name], name === 'suspended' ? 'suspended' : 'active'])
  }
  // A server-only invitation can be issued before the first administrator exists.
  const invitation = await root.query('select private.issue_bootstrap_invite() as code')
  const code = invitation.rows[0].code
  assert.match(code, /^[a-f0-9]{64}$/)
  const stored = await root.query("select id, code_hash from private.invite_codes where code_hash = encode(extensions.digest($1, 'sha256'),'hex')", [code])
  assert.equal(stored.rowCount, 1)
  assert.notEqual(stored.rows[0].code_hash, code)
  ids.bootstrapInvite = stored.rows[0].id
  await assert.rejects(root.query('select private.issue_bootstrap_invite()'), /BOOTSTRAP_INVITE_EXISTS/)
  await assert.rejects(root.query('select private.bootstrap_admin($1)', [users.adminA]), /VERIFIED_REDEEMED_MEMBER_REQUIRED/)
  // Local fixture simulates stage-3 redemption; no public redemption endpoint exists yet.
  await root.query('update private.invite_codes set used_count=1 where id=$1', [ids.bootstrapInvite])
  await root.query('insert into private.invite_redemptions(invite_id,user_id) values($1,$2)', [ids.bootstrapInvite, users.adminA])
  await root.query('insert into private.invite_codes(id,code_hash,expires_at,max_uses) values($1,repeat(\'a\',64),now()+interval \'7 days\',10)', [ids.invite])
  await root.query('insert into private.invite_redemptions(invite_id,user_id) values($1,$2)', [ids.invite, users.unverified])
  await assert.rejects(root.query('select private.bootstrap_admin($1)', [users.unverified]), /VERIFIED_REDEEMED_MEMBER_REQUIRED/)
  await root.query('select private.bootstrap_admin($1)', [users.adminA])
  await root.query("update private.members set role='admin' where user_id=$1", [users.adminB])
  for (const name of ['avatar', 'image', 'hiddenImage', 'pending', 'unused']) {
    await root.query('insert into public.assets(id,storage_path,mime_type,size_bytes,status) values($1,$2,\'image/png\',128,$3)', [ids[name], `${ids[name]}.png`, name === 'pending' ? 'pending' : 'ready'])
    await root.query('insert into private.asset_owners(asset_id,user_id) values($1,$2)', [ids[name], users.memberA])
  }
  for (const name of ['character', 'secondCharacter']) {
    await root.query('insert into public.characters(id,name,avatar_asset_id) values($1,$2,$3)', [ids[name], name, name === 'character' ? ids.avatar : null])
    await root.query('insert into private.character_owners(character_id,user_id) values($1,$2)', [ids[name], name === 'character' ? users.memberA : users.memberB])
  }
  for (const name of ['post', 'hidden', 'deleted', 'poll', 'otherPoll']) {
    await root.query(`insert into public.posts(id,category_id,type,title,body_text,author_character_id,author_name_snapshot,author_avatar_asset_id,status)
      values($1,$2,$3,$4,'테스트 본문',$5,'작성 당시 이름',$6,$7)`, [ids[name], category, ['poll','otherPoll'].includes(name) ? 'poll' : 'general', name, ids.character, ids.avatar, name === 'hidden' ? 'moderator_hidden' : name === 'deleted' ? 'author_deleted' : 'published'])
    await root.query("insert into private.content_owners(content_kind,content_id,user_id) values('post',$1,$2)", [ids[name], users.memberA])
  }
  await root.query('insert into public.post_images(post_id,asset_id,position) values($1,$2,1),($3,$4,1)', [ids.post, ids.image, ids.hidden, ids.hiddenImage])
  for (const name of ['comment', 'deletedComment', 'reply']) {
    await root.query(`insert into public.comments(id,post_id,parent_id,body,author_character_id,author_name_snapshot,status)
      values($1,$2,$3,'댓글 본문',$4,'댓글 작성자',$5)`, [ids[name], ids.post, name === 'reply' ? ids.deletedComment : null, ids.character, name === 'deletedComment' ? 'author_deleted' : 'published'])
  }
  for (const name of ['poll', 'otherPoll']) {
    await root.query('insert into public.polls(post_id,question) values($1,\'테스트 질문\')', [ids[name]])
    await root.query('insert into public.poll_options(id,poll_id,text,position) values($1,$2,\'선택지\',1)', [name === 'poll' ? ids.option : ids.otherOption, ids[name]])
  }
  await root.query('insert into private.poll_votes(id,poll_id,user_id) values($1,$2,$3)', [ids.vote, ids.poll, users.memberA])
  await root.query('insert into private.poll_vote_choices(vote_id,poll_id,option_id) values($1,$2,$3)', [ids.vote, ids.poll, ids.option])
})

after(async () => {
  if (uploadedObjects.length) {
    const removed = await auth.storage.from('community').remove(uploadedObjects)
    assert.equal(removed.error, null)
  }
  // Cleanup only these randomly identified test rows. Never reset or truncate a developer database.
  await root.query('begin')
  try {
    await root.query('delete from private.poll_vote_choices where vote_id=$1', [ids.vote])
    await root.query('delete from private.poll_votes where id=$1', [ids.vote])
    await root.query('delete from public.poll_options where id=any($1::uuid[])', [[ids.option, ids.otherOption]])
    await root.query('delete from public.polls where post_id=any($1::uuid[])', [[ids.poll, ids.otherPoll]])
    await root.query('delete from public.comments where id=$1', [ids.reply])
    await root.query('delete from public.comments where id=any($1::uuid[])', [[ids.comment, ids.deletedComment]])
    await root.query('delete from public.post_images where post_id=any($1::uuid[])', [[ids.post, ids.hidden]])
    await root.query('delete from private.content_owners where user_id=any($1::uuid[])', [createdUsers])
    await root.query('delete from public.posts where id=any($1::uuid[])', [[ids.post, ids.hidden, ids.deleted, ids.poll, ids.otherPoll]])
    await root.query('delete from private.character_owners where user_id=any($1::uuid[])', [createdUsers])
    await root.query('delete from public.characters where id=any($1::uuid[])', [[ids.character, ids.secondCharacter]])
    await root.query('delete from private.asset_owners where user_id=any($1::uuid[])', [createdUsers])
    await root.query('delete from public.assets where id=any($1::uuid[])', [[ids.avatar, ids.image, ids.hiddenImage, ids.pending, ids.unused]])
    await root.query('delete from private.invite_redemptions where user_id=any($1::uuid[])', [createdUsers])
    await root.query('delete from private.invite_codes where id=any($1::uuid[])', [[ids.invite, ids.bootstrapInvite].filter(Boolean)])
    await root.query('delete from private.moderation_logs where actor_user_id=any($1::uuid[]) or target_user_id=any($1::uuid[])', [createdUsers])
    // The owner may remove test-only administrators during cleanup. Rollback restores the trigger on failure.
    await root.query('alter table private.members disable trigger protect_last_admin')
    await root.query('delete from private.members where user_id=any($1::uuid[])', [createdUsers])
    await root.query('alter table private.members enable trigger protect_last_admin')
    await root.query('commit')
  } catch (error) { await root.query('rollback'); throw error }
  finally { await root.end() }
  for (const id of createdUsers) {
    const result = await auth.auth.admin.deleteUser(id)
    assert.equal(result.error, null)
  }
})

test('versioned limits match the shared configuration and bucket is private', async () => {
  assert.deepEqual((await root.query('select limits from private.app_config')).rows[0].limits, limits)
  const bucket = (await root.query("select public,file_size_limit,allowed_mime_types from storage.buckets where id='community'")).rows[0]
  assert.equal(bucket.public, false)
  assert.equal(Number(bucket.file_size_limit), limits.imageInputBytesMax)
  assert.deepEqual(bucket.allowed_mime_types, limits.imageMimeTypes)
})

test('all application tables have RLS and definer functions pin search_path', async () => {
  assert.equal((await root.query(`select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private') and c.relkind='r' and not c.relrowsecurity`)).rowCount, 0)
  assert.equal((await root.query(`select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.prosecdef and not coalesce(p.proconfig @> array['search_path=""'], false)`)).rowCount, 0)
})

test('anon, uninvited and suspended identities cannot read protected content', async () => {
  await assert.rejects(asUser(env, null, 'select * from public.feed_posts'), { code: '42501' })
  for (const actor of ['uninvited', 'suspended']) {
    for (const table of ['posts','feed_posts','comments','visible_comments','characters','categories','post_images','polls','poll_options']) {
      assert.equal((await asUser(env, users[actor], `select * from public.${table}`)).rowCount, 0)
    }
  }
})

test('active members see normal content, never hidden/deleted bodies', async () => {
  for (const actor of ['memberA', 'memberB', 'adminA', 'adminB']) {
    const posts = (await asUser(env, users[actor], 'select * from public.feed_posts')).rows
    assert.equal(posts.length, 3)
    assert.ok(posts.every(row => !Object.hasOwn(row, 'user_id') && !Object.hasOwn(row, 'email')))
    assert.equal((await asUser(env, users[actor], 'select * from public.posts where id=any($1::uuid[])', [[ids.hidden, ids.deleted]])).rowCount, 0)
    assert.equal((await asUser(env, users[actor], 'select * from public.comments where id=$1', [ids.deletedComment])).rowCount, 0)
    assert.equal((await asUser(env, users[actor], 'select * from public.visible_comments where id=$1', [ids.reply])).rowCount, 1)
  }
})

test('private owners, invitations, votes, configuration and logs are not directly readable even by admins', async () => {
  for (const actor of ['memberA', 'memberB', 'adminA']) {
    for (const table of ['members','character_owners','content_owners','asset_owners','invite_codes','invite_redemptions','poll_votes','poll_vote_choices','moderation_logs','app_config']) {
      await denied(actor, `select * from private.${table}`)
    }
    await denied(actor, 'select * from public.assets')
    await denied(actor, 'select email from auth.users')
  }
})

test('direct writes, ownership forgery and role escalation are denied', async () => {
  for (const actor of ['memberA', 'adminA']) {
    await denied(actor, "update private.members set role='admin' where user_id=$1", [users.memberA])
    await denied(actor, "update public.posts set title='변조' where id=$1", [ids.post])
    await denied(actor, 'delete from public.comments where id=$1', [ids.comment])
    await denied(actor, "insert into public.characters(name) values('위조')")
    await denied(actor, "insert into private.character_owners(character_id,user_id) values($1,$2)", [randomUUID(), users.memberA])
  }
  for (const actor of ['memberA', 'uninvited', 'suspended']) {
    await denied(actor, 'select public.change_member_role($1,\'admin\',\'위조\')', [users[actor]])
    await denied(actor, 'select public.change_member_status($1,\'active\',\'위조\')', [users.suspended])
    await denied(actor, 'select * from public.get_moderation_logs()')
  }
})

test('only own membership status is returned; auth registration alone is not membership', async () => {
  assert.deepEqual((await asUser(env, users.memberA, 'select * from public.current_membership()')).rows, [{ role: 'member', status: 'active' }])
  assert.deepEqual((await asUser(env, users.suspended, 'select * from public.current_membership()')).rows, [{ role: 'member', status: 'suspended' }])
  assert.equal((await asUser(env, users.uninvited, 'select * from public.current_membership()')).rowCount, 0)
})

test('bootstrap is SQL-owner only and cannot run again after initialization', async () => {
  await assert.rejects(root.query('select private.bootstrap_admin($1)', [users.memberB]), /BOOTSTRAP_ALREADY_COMPLETED/)
  for (const actor of ['memberA','adminA']) {
    await denied(actor, 'select private.bootstrap_admin($1)', [users.memberA])
    await denied(actor, 'select private.issue_bootstrap_invite()')
  }
  assert.equal((await root.query("select has_function_privilege('service_role','private.bootstrap_admin(uuid)','EXECUTE') as allowed")).rows[0].allowed, false)
})

test('storage access requires membership, ready asset and a visible reference', async () => {
  for (const actor of ['uninvited','suspended']) {
    assert.equal((await asUser(env, users[actor], 'select private.can_read_asset_path($1) as allowed', [`${ids.image}.png`])).rows[0].allowed, false)
  }
  for (const name of ['image','avatar','hiddenImage','pending','unused']) {
    assert.equal((await asUser(env, users.memberB, 'select private.can_read_asset_path($1) as allowed', [`${ids[name]}.png`])).rows[0].allowed, ['image','avatar'].includes(name))
  }
  // Policy enforcement on storage.objects, not just the helper.
  await root.query('begin')
  try {
    await root.query("insert into storage.objects(bucket_id,name) values('community',$1),('community',$2)", [`${ids.image}.png`, `${ids.hiddenImage}.png`])
    await root.query('set local role authenticated')
    await root.query("select set_config('request.jwt.claim.sub',$1,true)", [users.memberB])
    assert.equal((await root.query("select * from storage.objects where bucket_id='community'")).rowCount, 1)
  } finally { await root.query('rollback') }
  await denied('memberA', "insert into storage.objects(bucket_id,name) values('community','forged.png')")
})

test('DB constraints protect lengths, image positions, reply depth, vote uniqueness and references', async () => {
  const checks = [
    ["update public.characters set name=$1 where id=$2", ['가'.repeat(limits.characterNameMax+1), ids.character], '23514'],
    ["update public.posts set title=$1 where id=$2", ['가'.repeat(limits.postTitleMax+1), ids.post], '23514'],
    ["insert into public.post_images(post_id,asset_id,position) values($1,$2,$3)", [ids.post, ids.unused, limits.postImagesMax+1], '23514'],
    ['insert into private.poll_votes(poll_id,user_id) values($1,$2)', [ids.poll, users.memberA], '23505'],
    ['insert into private.poll_vote_choices(vote_id,poll_id,option_id) values($1,$2,$3)', [ids.vote, ids.poll, ids.otherOption], '23503'],
    ["update public.posts set author_name_snapshot='위조' where id=$1", [ids.post], '23514'],
    ['delete from public.characters where id=$1', [ids.character], '23503'],
    ['delete from public.assets where id=$1', [ids.avatar], '23503'],
    ["insert into public.comments(post_id,parent_id,body,author_character_id,author_name_snapshot) values($1,$2,'답글',$3,'이름')", [ids.post,ids.reply,ids.character], '23514'],
    ["insert into public.comments(post_id,parent_id,body,author_character_id,author_name_snapshot) values($1,$2,'답글',$3,'이름')", [ids.hidden,ids.comment,ids.character], '23503'],
  ]
  for (const [sql, values, code] of checks) await assert.rejects(root.query(sql,values), { code })
})

test('multiple admins can be granted and changes are audited with the authenticated actor', async () => {
  const db = await connect(env)
  try {
    await db.query('begin')
    await db.query('set local role authenticated')
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [users.adminA])
    await db.query("select public.change_member_role($1,'admin','역할 테스트')", [users.memberA])
    await db.query("select public.change_member_role($1,'admin','역할 테스트')", [users.memberB])
    const rows = (await db.query('select * from public.get_moderation_logs()')).rows
    assert.ok(rows.some(row => row.actor_user_id === users.adminA && row.target_user_id === users.memberB && row.action === 'role:admin'))
    await db.query("select public.change_member_status($1,'suspended','정지 테스트')", [users.memberB])
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [users.memberB])
    assert.equal((await db.query('select * from public.feed_posts')).rowCount, 0)
  } finally { await db.query('rollback'); await db.end() }
})

test('last admin downgrade, suspension and deletion are rejected', async () => {
  await root.query('begin')
  try {
    await root.query("update private.members set role='member' where user_id=$1", [users.adminB])
    for (const sql of ["update private.members set role='member' where user_id=$1", "update private.members set status='suspended' where user_id=$1", 'delete from private.members where user_id=$1']) {
      await root.query('savepoint last_admin')
      await assert.rejects(root.query(sql, [users.adminA]), /LAST_ACTIVE_ADMIN/)
      await root.query('rollback to savepoint last_admin')
    }
  } finally { await root.query('rollback') }
})

test('concurrent administrator self-demotions leave exactly one active admin', async () => {
  const a = await connect(env), b = await connect(env)
  async function demote(db, id) {
    try {
      await db.query('begin')
      await db.query('set local role authenticated')
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id])
      await db.query("select public.change_member_role($1,'member','동시 요청 테스트')", [id])
      await db.query('commit')
      return 'success'
    } catch (error) { await db.query('rollback'); return error.message }
  }
  try {
    const results = await Promise.all([demote(a, users.adminA), demote(b, users.adminB)])
    assert.deepEqual(results.sort(), ['LAST_ACTIVE_ADMIN', 'success'])
    assert.equal(Number((await root.query("select count(*) from private.members where role='admin' and status='active'")).rows[0].count), 1)
  } finally {
    await a.end(); await b.end()
    await root.query("update private.members set role='admin' where user_id=any($1::uuid[])", [[users.adminA,users.adminB]])
  }
})

test('real Auth JWTs obey the PostgREST boundary and reject writes / private schema', async () => {
  for (const actor of ['memberA','memberB','adminA','uninvited','suspended']) {
    const response = await api(actor, 'feed_posts?select=*')
    assert.equal(response.status, 200)
    assert.equal((await response.json()).length, ['uninvited','suspended'].includes(actor) ? 0 : 3)
  }
  assert.ok((await api(null, 'feed_posts?select=*')).status >= 400)
  assert.ok((await api('adminA', 'members?select=*', { headers: { 'Accept-Profile': 'private' } })).status >= 400)
  assert.ok((await api('memberA', `posts?id=eq.${ids.post}`, { method:'PATCH', body: JSON.stringify({ title:'위조' }) })).status >= 400)
  assert.ok((await api('memberA', 'rpc/change_member_role', { method:'POST', body: JSON.stringify({ target_user_id:users.memberA, new_role:'admin', reason:'위조' }) })).status >= 400)
})

test('concurrent self-suspensions also preserve an active administrator', async () => {
  const a = await connect(env), b = await connect(env)
  async function suspend(db, id) {
    try {
      await db.query('begin')
      await db.query('set local role authenticated')
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id])
      await db.query("select public.change_member_status($1,'suspended','동시 정지 테스트')", [id])
      await db.query('commit')
      return 'success'
    } catch (error) { await db.query('rollback'); return error.message }
  }
  try {
    assert.deepEqual((await Promise.all([suspend(a,users.adminA),suspend(b,users.adminB)])).sort(), ['LAST_ACTIVE_ADMIN','success'])
  } finally {
    await a.end(); await b.end()
    await root.query("update private.members set status='active' where user_id=any($1::uuid[])", [[users.adminA,users.adminB]])
  }
})

test('authorization is rechecked after a concurrent admin revocation', async () => {
  const first = await connect(env), second = await connect(env)
  let pending
  try {
    await first.query('begin')
    await first.query('set local role authenticated')
    await first.query("select set_config('request.jwt.claim.sub',$1,true)", [users.adminA])
    await first.query("select public.change_member_role($1,'member','관리자 회수')", [users.adminB])
    await second.query('begin')
    await second.query('set local role authenticated')
    await second.query("select set_config('request.jwt.claim.sub',$1,true)", [users.adminB])
    const pid = (await second.query('select pg_backend_pid() as pid')).rows[0].pid
    pending = second.query("select public.change_member_role($1,'admin','회수 중 요청')", [users.memberA]).then(() => 'unexpected success', error => error.message)
    // Wait for a real database lock, not a timing guess.
    let blocked = false
    for (let attempt=0; attempt<100; attempt++) {
      const state = await root.query("select wait_event_type from pg_stat_activity where pid=$1", [pid])
      if (state.rows[0]?.wait_event_type === 'Lock') { blocked=true; break }
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    assert.ok(blocked, 'second request must wait on the membership guard')
    await first.query('commit')
    assert.equal(await pending, 'ADMIN_REQUIRED')
  } finally {
    await first.query('rollback')
    await second.query('rollback')
    await first.end(); await second.end()
    await root.query("update private.members set role='admin' where user_id=$1", [users.adminB])
  }
})

test('real Storage download requires membership and visible reference; uploads remain closed', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA1sAAAAASUVORK5CYII=', 'base64')
  for (const name of ['image','hiddenImage']) {
    const path = `${ids[name]}.png`
    const result = await auth.storage.from('community').upload(path, png, { contentType: 'image/png' })
    assert.equal(result.error, null)
    uploadedObjects.push(path)
  }
  for (const actor of ['memberA','memberB','uninvited','suspended',null]) {
    const response = await fetch(`${env.API_URL}/storage/v1/object/authenticated/community/${ids.image}.png`, {
      headers: { apikey:env.ANON_KEY, Authorization:`Bearer ${actor ? tokens[actor] : env.ANON_KEY}` },
    })
    assert.equal(response.ok, actor === 'memberA' || actor === 'memberB')
  }
  const hidden = await fetch(`${env.API_URL}/storage/v1/object/authenticated/community/${ids.hiddenImage}.png`, {
    headers: { apikey:env.ANON_KEY, Authorization:`Bearer ${tokens.memberA}` },
  })
  assert.equal(hidden.ok, false)
  const client = createClient(env.API_URL, env.ANON_KEY, { auth:{persistSession:false}, global:{headers:{Authorization:`Bearer ${tokens.memberA}`}} })
  assert.ok((await client.storage.from('community').upload(`forged-${randomUUID()}.png`, png, {contentType:'image/png'})).error)
})
