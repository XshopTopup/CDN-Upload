// index.js
require('dotenv').config();

const express = require('express');
const { Octokit } = require('@octokit/rest');
const multer = require('multer');
const path = require('path');
const cors = require('cors');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

/* ===== CONFIG ===== */
const CONFIG = {
  SHORT_BASE: process.env.SHORT_BASE || 'https://url.arsyilla.my.id', // domain pendek milikmu
  GH_TOKEN: process.env.GH_TOKEN || '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',
  DEFAULT_OWNER: process.env.GH_OWNER || 'xhoptopup',
  DEFAULT_REPO: process.env.GH_REPO || 'db.arsyilla',
  DEFAULT_BRANCH: process.env.GH_BRANCH || 'main',
};

app.set('trust proxy', true);
app.use(cors());
app.use(express.json());

const octokit = new Octokit({ auth: CONFIG.GH_TOKEN });

/* ===== PAGE ===== */
const fs = require('fs');
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

/* ===== UPLOAD -> GitHub, RESPON: short URL ===== */
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // slug/filename acak
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let slug = '';
    for (let i = 0; i < 6; i++) slug += chars.charAt(Math.floor(Math.random() * chars.length));
    const filename = `${slug}${path.extname(req.file.originalname)}`; // simpan ekstensi untuk MIME benar di GitHub

    const contentB64 = Buffer.from(req.file.buffer).toString('base64');

    // optional: cek eksistensi untuk dapatkan sha (idempoten)
    let sha;
    try {
      const { data } = await octokit.repos.getContent({
        owner: CONFIG.DEFAULT_OWNER,
        repo: CONFIG.DEFAULT_REPO,
        path: filename,
      });
      sha = data.sha;
    } catch (e) {
      if (e.status !== 404) throw e;
    }

    // commit ke GitHub
    await octokit.repos.createOrUpdateFileContents({
      owner: CONFIG.DEFAULT_OWNER,
      repo: CONFIG.DEFAULT_REPO,
      path: filename,
      message: `Upload ${req.file.originalname}`,
      content: contentB64,
      ...(sha && { sha }),
      branch: CONFIG.DEFAULT_BRANCH,
    });

    // bentuk URL
    const rawUrl = `https://raw.githubusercontent.com/${CONFIG.DEFAULT_OWNER}/${CONFIG.DEFAULT_REPO}/${CONFIG.DEFAULT_BRANCH}/${encodeURIComponent(filename)}`;
    const shortUrl = `${CONFIG.SHORT_BASE}/${encodeURIComponent(filename)}`;
    const shortUrlFull = `${CONFIG.SHORT_BASE}/${CONFIG.DEFAULT_OWNER}/${CONFIG.DEFAULT_REPO}/${CONFIG.DEFAULT_BRANCH}/${encodeURIComponent(filename)}`;

    return res.json({
      success: true,
      message: 'File uploaded successfully',
      url_raw: rawUrl,
      url_short: shortUrl,           // memakai default owner/repo/branch server
      url_short_full: shortUrlFull,  // eksplisit owner/repo/branch
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to upload file' });
  }
});

/* ===== REDIRECTOR KE RAW.GITHUBUSERCONTENT =====
   Mendukung:
   1) /:file                           -> default owner/repo/branch
   2) /:owner/:repo/:branch/:file      -> eksplisit
*/
function toRaw(owner, repo, branch, file) {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${file}`;
}

// urutan penting: definisikan rute spesifik dulu (di atas), lalu rute dinamis

// format eksplisit
app.get('/:owner/:repo/:branch/:file', (req, res) => {
  const { owner, repo, branch, file } = req.params;
  if (file === 'favicon.ico') return res.status(404).end();
  const dest = toRaw(
    decodeURIComponent(owner),
    decodeURIComponent(repo),
    decodeURIComponent(branch),
    decodeURIComponent(file)
  );
  res.redirect(302, dest);
});

// format sederhana dengan default owner/repo/branch
app.get('/:file', (req, res) => {
  const { file } = req.params;
  if (file === 'favicon.ico') return res.status(404).end();
  const dest = toRaw(
    CONFIG.DEFAULT_OWNER,
    CONFIG.DEFAULT_REPO,
    CONFIG.DEFAULT_BRANCH,
    decodeURIComponent(file)
  );
  res.redirect(302, dest);
});

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}
