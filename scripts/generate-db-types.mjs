import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { localConfig } from './local-db.mjs'

localConfig()
const raw = execFileSync(process.execPath, ['scripts/supabase.mjs', 'gen', 'types', 'typescript', '--local', '--schema', 'public'], { encoding: 'utf8' })
const types = raw.split('\n').map(line => line.trimEnd()).join('\n').trim() + '\n'
if (!types.includes('export type Database =')) throw new Error('Type generation failed')
const path = 'src/types/database.ts'
if (process.argv.includes('--check')) {
  if (readFileSync(path, 'utf8') !== types) throw new Error('Generated database types are stale; run pnpm db:types')
  console.log('Database types match the local schema')
} else writeFileSync(path, types)
