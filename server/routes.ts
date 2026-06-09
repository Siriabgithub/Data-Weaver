import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { api } from "@shared/routes";

// ──────────────────────────────────────────────────────────
// Directory setup
// ──────────────────────────────────────────────────────────

const uploadDir = path.join(process.cwd(), "server/uploads");
const processedDir = path.join(process.cwd(), "server/processed");

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir, { recursive: true });

// ──────────────────────────────────────────────────────────
// Multer – 200 MB limit
// ──────────────────────────────────────────────────────────

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + "-" + file.originalname);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
});

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

function slog(level: "INFO" | "WARN" | "ERROR", msg: string, extra?: object) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...extra,
  });
  if (level === "ERROR") {
    console.error(line);
  } else {
    console.log(line);
  }
}

/**
 * Parse progress lines from Python stderr.
 * Format: "PROGRESS:<pct>:<phase>"
 */
function parseProgress(line: string): { pct: number; phase: string } | null {
  if (!line.startsWith("PROGRESS:")) return null;
  const parts = line.split(":");
  if (parts.length < 3) return null;
  const pct = parseInt(parts[1], 10);
  const phase = parts.slice(2).join(":");
  if (isNaN(pct)) return null;
  return { pct, phase };
}

/**
 * Extract the last valid JSON line from Python stdout.
 * Ignores any accidental non-JSON lines before the final result.
 */
function extractLastJson(stdout: string): object | null {
  const lines = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .reverse();

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (typeof parsed === "object") return parsed;
    } catch {
      // skip non-JSON lines
    }
  }
  return null;
}

// ──────────────────────────────────────────────────────────
// Routes
// ──────────────────────────────────────────────────────────

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // GET /api/files
  app.get(api.files.list.path, async (_req, res) => {
    const files = await storage.getFiles();
    res.json(files);
  });

  // GET /api/files/:id
  app.get(api.files.get.path, async (req, res) => {
    const id = parseInt(req.params.id);
    const file = await storage.getFile(id);
    if (!file) return res.status(404).json({ message: "File not found" });
    res.json(file);
  });

  // POST /api/files  (upload)
  app.post(api.files.upload.path, (req, res) => {
    upload.single("file")(req, res, async (err) => {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res
          .status(413)
          .json({ message: "File too large. Maximum upload size is 200 MB." });
      }
      if (err) {
        slog("ERROR", "Multer error", { err: String(err) });
        return res.status(500).json({ message: "Upload failed." });
      }
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded." });
      }

      try {
        slog("INFO", "Upload started", {
          originalName: req.file.originalname,
          size: req.file.size,
        });

        const file = await storage.createFile({
          filename: req.file.filename,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size,
        });

        slog("INFO", "Upload completed", { fileId: file.id, name: file.originalName });
        res.status(201).json(file);
      } catch (error) {
        slog("ERROR", "Upload DB error", { err: String(error) });
        res.status(500).json({ message: "Failed to save file metadata." });
      }
    });
  });

  // POST /api/files/:id/process
  app.post(api.files.process.path, async (req, res) => {
    const id = parseInt(req.params.id);
    const file = await storage.getFile(id);
    if (!file) return res.status(404).json({ message: "File not found" });

    slog("INFO", "Processing started", {
      fileId: id,
      name: file.originalName,
      size: file.size,
    });

    // Mark as processing with initial progress
    await storage.updateFileStatus(id, "processing", {
      progress: 0,
      phase: "Starting",
    });

    const scriptPath = path.join(process.cwd(), "python/process.py");
    const filePath = path.join(uploadDir, file.filename);

    if (!fs.existsSync(filePath)) {
      await storage.updateFileStatus(id, "error", undefined, "Uploaded file not found on disk.");
      return res.status(404).json({ message: "Uploaded file missing from disk." });
    }

    const pythonProcess = spawn("python3", [scriptPath, filePath, processedDir]);

    let stdoutBuf = "";
    let stderrBuf = "";

    // ── stdout: accumulate for final JSON ────────────────
    pythonProcess.stdout.on("data", (data: Buffer) => {
      stdoutBuf += data.toString();
    });

    // ── stderr: structured logging + progress updates ────
    pythonProcess.stderr.on("data", async (data: Buffer) => {
      const text = data.toString();
      stderrBuf += text;

      // Parse each line from this chunk
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const progress = parseProgress(trimmed);
        if (progress) {
          slog("INFO", "Python progress", {
            fileId: id,
            pct: progress.pct,
            phase: progress.phase,
          });
          // Update DB progress (fire-and-forget; don't await to keep streaming fast)
          storage
            .updateFileStatus(id, "processing", {
              progress: progress.pct,
              phase: progress.phase,
            })
            .catch(() => {});
        } else {
          slog("INFO", `Python: ${trimmed}`, { fileId: id });
        }
      }
    });

    // ── Process exit ─────────────────────────────────────
    pythonProcess.on("close", async (code) => {
      slog("INFO", `Python process exited`, { fileId: id, code });

      if (code === 0) {
        const result = extractLastJson(stdoutBuf) as any;
        if (result) {
          await storage.updateFileStatus(id, "completed", result);
          slog("INFO", "Processing completed", {
            fileId: id,
            rows: result.rowCount,
            cols: result.columnCount,
            time: result.processingTime,
          });
        } else {
          const errMsg = "Python produced no parseable JSON output.";
          slog("ERROR", errMsg, { fileId: id, stdout: stdoutBuf.slice(0, 500) });
          await storage.updateFileStatus(id, "error", undefined, errMsg);
        }
      } else {
        // Extract error from stdout JSON payload (Python writes error JSON to stdout too)
        const errResult = extractLastJson(stdoutBuf) as any;
        let errorMsg: string;
        if (errResult?.error) {
          errorMsg = errResult.error;
          if (errResult.traceback) {
            errorMsg += "\n\nTraceback:\n" + errResult.traceback;
          }
        } else {
          errorMsg =
            stderrBuf.trim().slice(-2000) ||
            "Processing failed with no error message captured.";
        }
        slog("ERROR", "Processing failed", { fileId: id, code, msg: errorMsg.slice(0, 300) });
        await storage.updateFileStatus(id, "error", undefined, errorMsg);
      }
    });

    // ── Timeout: kill after 15 minutes ───────────────────
    const TIMEOUT_MS = 15 * 60 * 1000;
    const timeoutHandle = setTimeout(async () => {
      if (!pythonProcess.killed) {
        slog("WARN", "Python process timed out – sending SIGTERM", { fileId: id });
        pythonProcess.kill("SIGTERM");
        setTimeout(() => {
          if (!pythonProcess.killed) pythonProcess.kill("SIGKILL");
        }, 5000);
        await storage.updateFileStatus(
          id,
          "error",
          undefined,
          "Processing timed out after 15 minutes. The file may be too large or complex."
        );
      }
    }, TIMEOUT_MS);

    pythonProcess.on("close", () => clearTimeout(timeoutHandle));

    res.json({ message: "Processing started", status: "processing" });
  });

  // DELETE /api/files/:id
  app.delete(api.files.delete.path, async (req, res) => {
    const id = parseInt(req.params.id);
    const file = await storage.getFile(id);
    if (!file) return res.status(404).json({ message: "File not found" });

    // Remove original upload
    const filePath = path.join(uploadDir, file.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    // Remove processed CSV if present
    const base = path.parse(file.filename).name;
    const processedPath = path.join(processedDir, `processed_${base}.csv`);
    if (fs.existsSync(processedPath)) fs.unlinkSync(processedPath);

    await storage.deleteFile(id);
    slog("INFO", "File deleted", { fileId: id, name: file.originalName });
    res.status(204).send();
  });

  // GET /api/files/:id/download
  app.get("/api/files/:id/download", async (req, res) => {
    const id = parseInt(req.params.id);
    const file = await storage.getFile(id);
    if (!file) return res.status(404).send("File not found.");

    let filePath: string;
    if (file.status === "completed") {
      const base = path.parse(file.filename).name;
      const processedPath = path.join(processedDir, `processed_${base}.csv`);
      filePath = fs.existsSync(processedPath)
        ? processedPath
        : path.join(uploadDir, file.filename);
    } else {
      filePath = path.join(uploadDir, file.filename);
    }

    const downloadName =
      file.status === "completed"
        ? path.parse(file.originalName).name + "_cleaned.csv"
        : file.originalName;

    slog("INFO", "Download", { fileId: id, name: downloadName });
    res.download(filePath, downloadName);
  });

  return httpServer;
}
