// uploader.js (ESM)
import { Octokit } from '@octokit/rest'
import path from 'path'
import moment from 'moment-timezone'

const OWNER  = process.env.GH_OWNER
const REPO   = process.env.GH_REPO
const BRANCH = process.env.GH_BRANCH || 'main'
const okt    = new Octokit({ auth: process.env.GH_TOKEN })

async function getShaIfExists(apiPath) {
  try {
    const { data } = await okt.repos.getContent({ owner: OWNER, repo: REPO, path: apiPath, ref: BRANCH })
    return data.sha
  } catch (e) {
    if (e.status === 404) return null
    throw e
  }
}

export async function uploadBufferToGitHub({ buffer, ghPath }) {
  const base64  = buffer.toString('base64')
  const sha     = await getShaIfExists(ghPath)
  const message = `upload ${path.basename(ghPath)} @ ${moment().tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss')}`

  const res = await okt.repos.createOrUpdateFileContents({
    owner: OWNER,
    repo: REPO,
    branch: BRANCH,
    path: ghPath,
    message,
    content: base64,
    ...(sha ? { sha } : {})
  })

  return {
    owner: OWNER,
    repo: REPO,
    branch: BRANCH,
    path: res.data.content.path,
    html_url: res.data.content.html_url
  }
}

export async function upsertTextToGitHub({ text, ghPath, message = 'update file' }) {
  const sha = await getShaIfExists(ghPath)
  const base64 = Buffer.from(text, 'utf8').toString('base64')
  await okt.repos.createOrUpdateFileContents({
    owner: OWNER,
    repo: REPO,
    branch: BRANCH,
    path: ghPath,
    message,
    content: base64,
    ...(sha ? { sha } : {})
  })
}

export async function getTextFromGitHub({ ghPath }) {
  try {
    const { data } = await okt.repos.getContent({ owner: OWNER, repo: REPO, path: ghPath, ref: BRANCH })
    const b64 = data.content || ''
    return Buffer.from(b64, 'base64').toString('utf8')
  } catch (e) {
    if (e.status === 404) return null
    throw e
  }
}
