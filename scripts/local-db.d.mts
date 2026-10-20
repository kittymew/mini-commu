import type { Client, QueryResult } from 'pg'
export function localConfig(): Record<string, string>
export function connect(env: Record<string, string>): Promise<Client>
export function asUser(env: Record<string, string>, userId: string | null, query: string, values?: unknown[]): Promise<QueryResult>
