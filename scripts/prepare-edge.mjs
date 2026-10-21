import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'

const wasm = await readFile(new URL(import.meta.resolve('@imagemagick/magick-wasm/magick.wasm')))
if (!WebAssembly.validate(wasm)) throw new Error('Invalid ImageMagick WASM module')
const directory = new URL('../supabase/functions/_shared/',import.meta.url)
await mkdir(directory,{recursive:true})
await writeFile(new URL('magick.wasm',directory),wasm)
console.log(`Prepared Edge WASM: ${wasm.length} bytes, sha256 ${createHash('sha256').update(wasm).digest('hex')}`)
