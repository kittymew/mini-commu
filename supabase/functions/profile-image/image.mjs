import { ImageMagick, MagickImageCollection, MagickFormat, initializeImageMagick, ResourceLimits } from '@imagemagick/magick-wasm'
import { profileLimits as limits } from './limits.mjs'
export async function initializeImages(wasm) {
  await initializeImageMagick(wasm)
  ResourceLimits.memory = 128n * 1024n * 1024n
  ResourceLimits.disk = 0n
  ResourceLimits.maxProfileSize = 1024n * 1024n
  ResourceLimits.width = BigInt(limits.dimension)
  ResourceLimits.height = BigInt(limits.dimension)
  ResourceLimits.listLength = 2n
}
export function processProfile(bytes, mime) {
  if (!bytes.length || bytes.length > limits.inputBytes) throw new Error('IMAGE_TOO_LARGE')
  const text = (offset, length) => new TextDecoder().decode(bytes.subarray(offset, offset + length))
  let format
  if (bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff && mime==='image/jpeg') format=MagickFormat.Jpeg
  if (bytes[0]===137 && text(1,3)==='PNG' && mime==='image/png') {
    format=MagickFormat.Png
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)
    for (let p=8;p+12<=bytes.length;) {
      const length=view.getUint32(p)
      if (p+length+12>bytes.length) throw new Error('INVALID_IMAGE')
      if (text(p+4,4)==='acTL') throw new Error('ANIMATED_IMAGE')
      p+=length+12
    }
  }
  if (text(0,4)==='RIFF' && text(8,4)==='WEBP' && mime==='image/webp') {
    format=MagickFormat.WebP
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)
    for (let p=12;p+8<=bytes.length;) {
      const length=view.getUint32(p+4,true)
      if (p+length+8>bytes.length) throw new Error('INVALID_IMAGE')
      if (['ANIM','ANMF'].includes(text(p,4))) throw new Error('ANIMATED_IMAGE')
      p+=length+8+(length%2)
    }
  }
  if (!format) throw new Error('INVALID_IMAGE')
  const info = new MagickImageCollection()
  try {
    info.ping(bytes)
    if (info.length!==1) throw new Error('ANIMATED_IMAGE')
    const image=info[0]
    if (image.width * image.height>limits.pixels || image.width>limits.dimension || image.height>limits.dimension) throw new Error('IMAGE_DIMENSIONS')
  } finally { info.dispose() }
  return ImageMagick.read(bytes, format, image => {
    image.autoOrient()
    image.strip()
    const resize = edge => {
      const factor=Math.min(1,edge/Math.max(image.width,image.height))
      if (factor<1) image.resize(Math.max(1,Math.round(image.width*factor)),Math.max(1,Math.round(image.height*factor)))
    }
    image.quality=82
    resize(limits.longEdge)
    const main=image.write(MagickFormat.WebP,data=>Uint8Array.from(data))
    resize(limits.thumbnailEdge)
    const thumbnail=image.write(MagickFormat.WebP,data=>Uint8Array.from(data))
    if (main.length+thumbnail.length>limits.storedBytes) throw new Error('IMAGE_TOO_LARGE')
    return { main, thumbnail }
  })
}
