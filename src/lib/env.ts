type PublicEnv = { supabaseUrl: string; supabaseKey: string; siteUrl: string }
type EnvResult = { ready: true; values: PublicEnv } | { ready: false; issues: string[] }

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
  } catch { return false }
}

export function readPublicEnv(source: Record<string, string | undefined>): EnvResult {
  const supabaseUrl = source.VITE_SUPABASE_URL?.trim() ?? ''
  const supabaseKey = source.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''
  const siteUrl = source.VITE_SITE_URL?.trim() ?? ''
  const issues: string[] = []
  if (!isHttpUrl(supabaseUrl)) issues.push('VITE_SUPABASE_URL에 올바른 프로젝트 URL을 설정해 주세요.')
  if (!supabaseKey.startsWith('sb_publishable_')) issues.push('VITE_SUPABASE_PUBLISHABLE_KEY에 공개용 publishable key를 설정해 주세요.')
  if (!isHttpUrl(siteUrl) || (isHttpUrl(siteUrl) && (new URL(siteUrl).hash || new URL(siteUrl).search))) {
    issues.push('VITE_SITE_URL에 쿼리와 해시가 없는 사이트 URL을 설정해 주세요.')
  }
  return issues.length ? { ready: false, issues } : { ready: true, values: { supabaseUrl, supabaseKey, siteUrl } }
}

export const publicEnv = readPublicEnv(import.meta.env)
