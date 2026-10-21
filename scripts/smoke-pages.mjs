import {pagesUrl} from './validate-pages-env.mjs'

// Read-only check of the actual Pages artifact; never sends account credentials.
async function check() {
  const response = await fetch(pagesUrl, {signal:AbortSignal.timeout(20000),cache:'no-store'})
  if (!response.ok) throw new Error(`Pages returned HTTP ${response.status}`)
  const html = await response.text()
  if (!html.includes('<div id="root"></div>')) throw new Error('Application root missing')
  const assets = [...html.matchAll(/(?:src|href)="(\/mini-commu\/assets\/[^"?#]+\.(?:js|css))"/g)].map(match=>match[1])
  if (!assets.some(path=>path.endsWith('.js'))) throw new Error('Project subpath entry script missing')
  for(const path of new Set(assets)) {
    const file = await fetch(new URL(path,pagesUrl),{signal:AbortSignal.timeout(20000),cache:'no-store'})
    if (!file.ok || !/javascript|text\/css/.test(file.headers.get('content-type') ?? '')) throw new Error(`Published asset unavailable: ${path}`)
    await file.arrayBuffer()
  }
  console.log(`Published HTML and ${new Set(assets).size} entry assets are reachable`)
}
for(let attempt=0;;attempt++) {
  try { await check(); break } catch(error) {
    if(attempt===3) throw error
    await new Promise(resolve=>setTimeout(resolve,10000))
  }
}
