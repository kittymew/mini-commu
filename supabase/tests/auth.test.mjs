import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { localConfig, connect, asUser } from '../../scripts/local-db.mjs'

const env = localConfig()
const root = await connect(env)
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const users = []
const invites = []
const password = `Local-${randomUUID()}!`
async function user(confirmed = true) {
  const email = `stage3-${randomUUID()}@example.test`
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: confirmed })
  assert.equal(created.error, null)
  const item = { id: created.data.user.id, token: null }
  users.push(item.id)
  if (confirmed) {
    const client = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const login = await client.auth.signInWithPassword({ email, password })
    assert.equal(login.error, null)
    item.token = login.data.session.access_token
  }
  return item
}
async function invite({ expired = false, revoked = false, max = 1 } = {}) {
  const code = randomBytes(32).toString('hex')
  const result = await root.query(`insert into private.invite_codes(code_hash,expires_at,revoked_at,max_uses)
    values(encode(extensions.digest($1,'sha256'),'hex'),now() + $2::interval,case when $3 then now() else null end,$4) returning id`,
  [code, expired ? '-1 day' : '7 days', revoked, max])
  const id = result.rows[0].id
  invites.push(id)
  return { id, code }
}
async function rpc(actor, name, args) {
  const response = await fetch(`${env.API_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${actor?.token ?? env.ANON_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}
const redeem = (actor, code) => rpc(actor, 'redeem_invite', { invite_code: code })
let operator
before(async () => {
  assert.equal(Number((await root.query('select count(*) from private.members')).rows[0].count), 0, 'Use an empty disposable local database')
  operator = await user()
  const code = (await root.query('select private.issue_bootstrap_invite() as code')).rows[0].code
  const id = (await root.query("select id from private.invite_codes where code_hash=encode(extensions.digest($1,'sha256'),'hex')", [code])).rows[0].id
  invites.push(id)
  assert.equal((await redeem(operator, code)).body, 'JOINED')
  await root.query('select private.bootstrap_admin($1)', [operator.id])
})
after(async () => {
  try {
    await root.query('begin')
    await root.query('delete from private.invite_redemptions where user_id=any($1::uuid[])', [users])
    await root.query('delete from private.invite_codes where id=any($1::uuid[]) or created_by=any($2::uuid[])', [invites, users])
    await root.query('delete from private.moderation_logs where actor_user_id=any($1::uuid[]) or target_user_id=any($1::uuid[])', [users])
    await root.query('alter table private.members disable trigger protect_last_admin')
    await root.query('delete from private.members where user_id=any($1::uuid[])', [users])
    await root.query('alter table private.members enable trigger protect_last_admin')
    await root.query('commit')
  } catch (error) { await root.query('rollback'); throw error }
  finally { await root.end() }
  for (const id of users) assert.equal((await admin.auth.admin.deleteUser(id)).error, null)
})

test('anonymous and unverified accounts cannot redeem; bootstrap completes through the real API', async () => {
  const invitation = await invite()
  assert.equal((await redeem(null, invitation.code)).status, 401)
  const unverified = await user(false)
  assert.equal((await asUser(env, unverified.id, 'select public.redeem_invite($1) as result', [invitation.code])).rows[0].result, 'EMAIL_REQUIRED')
  assert.equal((await root.query('select used_count from private.invite_codes where id=$1', [invitation.id])).rows[0].used_count, 0)
  assert.equal((await rpc(operator, 'current_membership', {})).body[0].role, 'admin')
})

test('expired, revoked, malformed and exhausted invitations return the same safe error', async () => {
  const actor = await user()
  for (const options of [{ expired: true }, { revoked: true }]) assert.equal((await redeem(actor, (await invite(options)).code)).body, 'INVALID_INVITE')
  assert.equal((await redeem(actor, 'invalid')).body, 'INVALID_INVITE')
  const exhausted = await invite()
  await root.query('update private.invite_codes set used_count=max_uses where id=$1', [exhausted.id])
  assert.equal((await redeem(actor, exhausted.code)).body, 'INVALID_INVITE')
  assert.deepEqual((await rpc(actor, 'current_membership', {})).body, [])
})

test('last-use invitation admits exactly one concurrent account', async () => {
  const invitation = await invite()
  const a = await user(), b = await user()
  const results = await Promise.all([redeem(a, invitation.code), redeem(b, invitation.code)])
  assert.deepEqual(results.map(result => result.body).sort(), ['INVALID_INVITE', 'JOINED'])
  assert.equal((await root.query('select used_count from private.invite_codes where id=$1', [invitation.id])).rows[0].used_count, 1)
  assert.equal(Number((await root.query('select count(*) from private.invite_redemptions where invite_id=$1', [invitation.id])).rows[0].count), 1)
})

test('concurrent retries by one account consume only one invitation, including different codes', async () => {
  const a = await invite(), b = await invite(), actor = await user()
  const results = await Promise.all([redeem(actor, a.code), redeem(actor, b.code)])
  assert.deepEqual(results.map(result => result.body).sort(), ['ALREADY_MEMBER', 'JOINED'])
  assert.equal(Number((await root.query('select sum(used_count) as total from private.invite_codes where id=any($1::uuid[])', [[a.id, b.id]])).rows[0].total), 1)
  assert.equal((await redeem(actor, a.code)).body, 'ALREADY_MEMBER')
})

test('failed requests commit rate limits; parallel API requests cannot bypass the account limit', async () => {
  const actor = await user(), other = await user(), invitation = await invite()
  const attempts = await Promise.all(Array.from({ length: 7 }, () => redeem(actor, 'incorrect')))
  assert.equal(attempts.filter(result => result.body === 'INVALID_INVITE').length, 5)
  assert.equal(attempts.filter(result => result.body === 'RATE_LIMITED').length, 2)
  assert.equal((await redeem(actor, invitation.code)).body, 'RATE_LIMITED')
  assert.equal((await redeem(other, 'incorrect')).body, 'INVALID_INVITE')
  await assert.rejects(asUser(env, actor.id, 'delete from private.invite_attempts'), { code: '42501' })
  await root.query("update private.invite_attempts set window_start=now()-interval '16 minutes' where user_id=$1", [actor.id])
  assert.equal((await redeem(actor, invitation.code)).body, 'JOINED')
})

test('suspended accounts cannot reactivate by redeeming another code with an existing JWT', async () => {
  const actor = await user(), first = await invite(), next = await invite()
  assert.equal((await redeem(actor, first.code)).body, 'JOINED')
  assert.equal((await rpc(operator, 'change_member_status', { target_user_id: actor.id, new_status: 'suspended', reason: 'local test' })).status, 204)
  assert.equal((await redeem(actor, next.code)).body, 'SUSPENDED')
  assert.equal((await root.query('select used_count from private.invite_codes where id=$1', [next.id])).rows[0].used_count, 0)
  assert.equal((await asUser(env, actor.id, 'select * from public.categories')).rowCount, 0)
})

test('only active admins issue/manage invitations; listing never returns code or hash', async () => {
  const outsider = await user()
  assert.equal((await rpc(outsider, 'issue_invite', {})).status, 403)
  assert.equal((await rpc(outsider, 'list_invites', {})).status, 403)
  const issued = await rpc(operator, 'issue_invite', { valid_days: 7, use_limit: 2 })
  assert.equal(issued.status, 200)
  assert.match(issued.body[0].code, /^[a-f0-9]{64}$/)
  const id = issued.body[0].invite_id
  invites.push(id)
  const listed = await rpc(operator, 'list_invites', {})
  assert.equal(listed.status, 200)
  assert.ok(listed.body.some(row => row.id === id))
  assert.ok(listed.body.every(row => !('code' in row) && !('code_hash' in row)))
  assert.equal((await rpc(operator, 'update_invite', { target_id: id, expiry: new Date(Date.now() + 86400000).toISOString(), use_limit: 2, revoke_code: true })).status, 204)
  assert.equal((await redeem(outsider, issued.body[0].code)).body, 'INVALID_INVITE')
  assert.equal((await root.query("select 1 from private.moderation_logs where actor_user_id=$1 and action='invite:issue' and reason=$2", [operator.id, id])).rowCount, 1)
})
