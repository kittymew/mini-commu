import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import pg from 'pg'

// Never accept a remote database URL. The tests only target this checkout's local stack.
export function localConfig() {
  const output = execFileSync(process.execPath, ['scripts/supabase.mjs', 'status', '--output-format', 'json'], { encoding: 'utf8' })
  const status = JSON.parse(output)
  const env = status.env
  if (!env?.DB_URL || !env.API_URL) throw new Error('Start the local Supabase stack first')
  for (const value of [env.DB_URL, env.API_URL]) {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname)) {
      throw new Error('Refusing non-local Supabase target')
    }
  }
  if (status.identity?.projectRoot && status.identity.projectRoot !== resolve('.')) {
    throw new Error('Unexpected local project root')
  }
  return env
}
export async function connect(env) {
  const client = new pg.Client({ connectionString: env.DB_URL })
  await client.connect()
  return client
}

export async function asUser(env, userId, query, values = []) {
  const db = await connect(env)
  try {
    await db.query('begin')
    await db.query(userId ? 'set local role authenticated' : 'set local role anon')
    await db.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)", [
      userId ?? '', JSON.stringify({ sub: userId, role: userId ? 'authenticated' : 'anon' }),
    ])
    return await db.query(query, values)
  } finally {
    await db.query('rollback')
    await db.end()
  }
}
