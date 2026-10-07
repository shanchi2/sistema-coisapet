// Gera public/extensao-full-coisapet.zip a partir de extensao-full/ — roda
// antes do build (npm "prebuild"), então o zip baixado no sistema sempre
// bate com o código-fonte da extensão. Os ícones PNG ficam em base64 em
// extensao-full/icons.base64.json (sem binário no git). Zip sem
// compressão (STORE), escrito na mão pra não depender de biblioteca.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const SRC = 'extensao-full'
const OUT = 'public/extensao-full-coisapet.zip'

const files = []
for (const name of readdirSync(SRC).sort()) {
  if (name === 'icons.base64.json' || name.endsWith('.png')) continue
  files.push({ name: `${SRC}/${name}`, data: readFileSync(join(SRC, name)) })
}
const icons = JSON.parse(readFileSync(join(SRC, 'icons.base64.json'), 'utf8'))
for (const [name, b64] of Object.entries(icons)) files.push({ name: `${SRC}/${name}`, data: Buffer.from(b64, 'base64') })

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }

// Data fixa (01/01/2026) pra o zip não mudar a cada build à toa
const DOS_TIME = 0, DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1
const locals = [], centrals = []
let offset = 0
for (const f of files) {
  const name = Buffer.from(f.name, 'utf8'), crc = crc32(f.data), size = f.data.length
  const lh = Buffer.alloc(30)
  lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(0, 8)
  lh.writeUInt16LE(DOS_TIME, 10); lh.writeUInt16LE(DOS_DATE, 12); lh.writeUInt32LE(crc, 14)
  lh.writeUInt32LE(size, 18); lh.writeUInt32LE(size, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28)
  locals.push(lh, name, f.data)
  const ch = Buffer.alloc(46)
  ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(0, 10)
  ch.writeUInt16LE(DOS_TIME, 12); ch.writeUInt16LE(DOS_DATE, 14); ch.writeUInt32LE(crc, 16)
  ch.writeUInt32LE(size, 20); ch.writeUInt32LE(size, 24); ch.writeUInt16LE(name.length, 28)
  ch.writeUInt32LE(offset, 42)
  centrals.push(ch, name)
  offset += 30 + name.length + size
}
const central = Buffer.concat(centrals)
const end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10)
end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16)
mkdirSync('public', { recursive: true })
writeFileSync(OUT, Buffer.concat([...locals, central, end]))
console.log(`[extensao-full] ${OUT} gerado (${files.length} arquivos)`)
