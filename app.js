// app.js (ESM)
import 'dotenv/config'
import express from 'express'
import multer from 'multer'
import { nanoid } from 'nanoid'
import path from 'path'
import fs from 'fs'
import mime from 'mime-types'
import moment from 'moment-timezone'
import { fileURLToPath } from 'url'
import { uploadBufferToGitHub } from './uploader.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/* CONFIG */
const TZ = 'Asia/Jakarta'
moment.tz.setDefault(TZ)
const PORT = Number(process.env.PORT || 3010)
const BASE_URL = (process.env.BASE_URL || 'https://url.arsyilla.my.id').replace(/\/+$/,'') + '/'
const DATA_DIR = path.join(process.cwd(), 'data')
const MAP_PATH = path.join(DATA_DIR, 'urls.json')

/* STATE */
function ensureDir(p){ if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive:true }) }
ensureDir(DATA_DIR)
if (!fs.existsSync(MAP_PATH)) fs.writeFileSync(MAP_PATH, '{}')
const readMap = () => JSON.parse(fs.readFileSync(MAP_PATH, 'utf8') || '{}')
const writeMap = (obj) => fs.writeFileSync(MAP_PATH, JSON.stringify(obj, null, 2))

/* APP */
const app = express()
app.set('view engine', 'ejs')
app.set('views', path.join(process.cwd(), 'views'))
app.use(express.urlencoded({ extended:true }))
app.use(express.json())
app.use('/static', express.static(path.join(process.cwd(), 'public'), { maxAge: '7d' }))

/* MULTER */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
})

/* HELPERS */
const EXT_DIR = {
  image: ['.jpg','.jpeg','.png','.gif','.webp'],
  videos: ['.mp4','.mov','.mkv','.webm'],
  archives: ['.zip','.rar','.7z'],
  docs: ['.pdf','.docx','.xlsx'],
  texts: ['.txt'],
  data: ['.csv','.json']
}
function pickDirByExt(ext){
  for (const [dir, exts] of Object.entries(EXT_DIR)){
    if (exts.includes(ext)) return dir
  }
  return 'files'
}
function buildRawUrl(owner, repo, branch, filePath){
  const segs = filePath.split('/').map(encodeURIComponent).join('/')
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${segs}`
}

/* ROUTES */
app.get('/', (req,res)=> res.render('index', { BASE_URL }))

app.get('/docs', (req, res) => {
  res.render('docs', { BASE_URL, TZ, PORT, EXT_DIR })
})

app.post('/upload', upload.single('file'), async (req,res)=>{
  try {
    if (!req.file) return res.status(400).send('file kosong')
    const orig = req.file.originalname || 'file'
    const ext = (path.extname(orig) || '').toLowerCase()
    const dir = pickDirByExt(ext)
    const slug = nanoid(10)
    const fileName = `${moment().format('DD-MMMM-YYYY~HH:mm:ss').toLowerCase()}${ext}`
    const ghPath = `${dir}/${fileName}`

    const { owner, repo, branch, html_url } = await uploadBufferToGitHub({
      buffer: req.file.buffer,
      ghPath
    })

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

    const link = BASE_URL + slug
    res.json({ slug, link, raw: rawUrl, repo_url: html_url })
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

/* START */
app.listen(PORT, ()=> console.log(`listening on ${PORT} — ${BASE_URL}`))
