const express = require("express")
const { Octokit } = require("@octokit/rest")
const multer = require("multer")
const path = require("path")
const cors = require("cors")

const app = express()
const upload = multer({ storage: multer.memoryStorage() })

app.use(cors())
//app.use(express.static("."))
app.use(express.json())

const octokit = new Octokit({
  auth: "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"
})

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"))
})

app.get("/docs", (req, res) => {
  res.sendFile(path.join(__dirname, "docs.html"))
})

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" })
    }

    const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
    let randomStr = ""
    for (let i = 0; i < 6; i++) {
      randomStr += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    const newPath = `${randomStr}${path.extname(req.file.originalname)}`

    const fileContent = req.file.buffer
    const encodedContent = Buffer.from(fileContent).toString("base64")

    let sha
    try {
      const { data } = await octokit.repos.getContent({
        owner: "my-database",
        repo: "database",
        path: newPath
      })
      sha = data.sha
    } catch (err) {
      if (err.status !== 404) throw err
    }

    const response = await octokit.repos.createOrUpdateFileContents({
      owner: "my-database",
      repo: "database",
      path: newPath,
      message: `Upload ${req.file.originalname}`,
      content: encodedContent,
      ...(sha && { sha })
    })

    res.json({
      success: true,
      message: "File uploaded successfully",
      url: `https://raw.githubusercontent.com/my-database/database/arsyilla/${newPath}`
      //url: response.data.content.html_url
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: "Failed to upload file" })
  }
})

module.exports = app

if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3030
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
}
