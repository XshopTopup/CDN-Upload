import 'dotenv/config'
import express from 'express'
import multer from 'multer'
import { nanoid } from 'nanoid'
import path from 'path'
import fs from 'fs'
import mime from 'mime-types'
import moment from 'moment-timezone'
import { fileURLToPath } from 'url'
import { uploadBufferToGitHub, getTextFromGitHub, upsertTextToGitHub } from './uploader.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/* CONFIG */
const TZ = 'Asia/Jakarta'
moment.tz.setDefault(TZ)
const PORT = Number(process.env.PORT || 3010)
const BASE_URL = (process.env.BASE_URL || 'https://url.arsyilla.my.id').replace(/\/+$/,'') + '/'

// ALWAYS use /tmp on Vercel
const DATA_DIR = path.join('/tmp', 'data')
const MAP_PATH = path.join(DATA_DIR, 'urls.json')
const MAP_GH_PATH = 'maps/urls.json'

/* STATE */
function ensureDir(p){ if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive:true }) }
ensureDir(DATA_DIR)
function readMap(){ try{ return JSON.parse(fs.readFileSync(MAP_PATH,'utf8')||'{}') } catch { return {} } }
function writeMap(obj){ fs.writeFileSync(MAP_PATH, JSON.stringify(obj,null,2)) }

/* APP */
const app = express()
app.set('view engine', 'ejs')
app.set('views', path.join(process.cwd(), 'views'))
app.use(express.urlencoded({ extended:true }))
app.use(express.json())
app.use('/static', express.static(path.join(process.cwd(), 'public'), { maxAge: '7d' }))

/* MULTER */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } })

/* HELPERS */
const EXT_DIR = {
  image: ['.jpg','.jpeg','.png','.gif','.webp'],
  videos: ['.mp4','.mov','.mkv','.webm'],
  archives: ['.zip','.rar','.7z'],
  docs: ['.pdf','.docx','.xlsx'],
  texts: ['.txt'],
  data: ['.csv','.json']
}
function pickDirByExt(ext){ for (const [d, xs] of Object.entries(EXT_DIR)) if (xs.includes(ext)) return d; return 'files' }
function buildRawUrl(owner, repo, branch, filePath){
  const segs = filePath.split('/').map(encodeURIComponent).join('/')
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${segs}`
}

/* ROUTES */
app.get('/', (req,res)=> res.render('index', { BASE_URL }))
app.get('/docs', (req,res)=> res.render('docs', { BASE_URL, TZ, PORT, EXT_DIR }))

app.post('/upload', upload.single('file'), async (req,res)=>{
  try {
    if (!req.file) return res.status(400).send('file kosong')
    const orig = req.file.originalname || 'file'
    const ext = (path.extname(orig) || '').toLowerCase()
    const dir = pickDirByExt(ext)
    const slug = nanoid(10)
    // gunakan HH-mm-ss, bukan HH:mm:ss (hindari ':')
    const fileName = `${moment().format('DD-MMMM-YYYY~HH-mm-ss').toLowerCase()}${ext}`
    const ghPath = `${dir}/${fileName}`

    const { owner, repo, branch, html_url } = await uploadBufferToGitHub({ buffer: req.file.buffer, ghPath })
    const rawUrl = buildRawUrl(owner, repo, branch, ghPath)

    const m = readMap()
    m[slug] = {
      rawUrl,
      htmlUrl: html_url,
      mime: req.file.mimetype || mime.lookup(ext) || 'application/octet-stream',
      name: orig,
      size: req.file.size,
      createdAt: moment().toISOString()
    }
    writeMap(m)
    await upsertTextToGitHub({ text: JSON.stringify(m, null, 2), ghPath: MAP_GH_PATH, message: 'update urls.json' })

    res.json({ slug, link: BASE_URL + slug, raw: rawUrl, repo_url: html_url })
  } catch (e){
    console.error('upload gagal:', e.status || '', e.message)
    res.status(500).json({ error: 'upload_gagal', detail: e.message })
  }
})

app.get('/:slug', (req,res)=>{
  const m = readMap()
  const rec = m[req.params.slug]
  if (!rec) return res.status(404).send('tidak ditemukan')
  res.setHeader('Cache-Control','public, max-age=60')
  res.render('view', { BASE_URL, slug: req.params.slug, rec })
})

app.get('/:slug/download', (req,res)=>{
  const m = readMap()
  const rec = m[req.params.slug]
  if (!rec) return res.status(404).send('tidak ditemukan')
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(rec.name)}"`)
  res.redirect(rec.rawUrl)
})

/* INIT: hydrate /tmp from GitHub */
async function init(){
  try{
    if (!fs.existsSync(MAP_PATH)) {
      const text = await getTextFromGitHub({ ghPath: MAP_GH_PATH })
      if (text) writeMap(JSON.parse(text)); else writeMap({})
    }
  }catch{ if (!fs.existsSync(MAP_PATH)) writeMap({}) }
}
await init()

app.listen(PORT, ()=> console.log(`listening on ${PORT} — ${BASE_URL}`))
