import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { api } from "@shared/routes"; // Import API contract
import { z } from "zod";

// Configure Multer for file uploads
const uploadDir = path.join(process.cwd(), "server/uploads");
const processedDir = path.join(process.cwd(), "server/processed");

// Ensure directories exist
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + '-' + file.originalname);
    }
  })
});

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // GET /api/files - List files
  app.get(api.files.list.path, async (req, res) => {
    const files = await storage.getFiles();
    res.json(files);
  });

  // GET /api/files/:id - Get file details
  app.get(api.files.get.path, async (req, res) => {
    const id = parseInt(req.params.id);
    const file = await storage.getFile(id);
    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }
    res.json(file);
  });

  // POST /api/files - Upload file
  app.post(api.files.upload.path, upload.single("file"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    try {
      const file = await storage.createFile({
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      });
      res.status(201).json(file);
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ message: "Failed to save file metadata" });
    }
  });

  // POST /api/files/:id/process - Trigger Python processing
  app.post(api.files.process.path, async (req, res) => {
    const id = parseInt(req.params.id);
    const file = await storage.getFile(id);
    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }

    // Update status to processing
    await storage.updateFileStatus(id, "processing");

    // Spawn Python process
    const scriptPath = path.join(process.cwd(), "python/process.py");
    const filePath = path.join(uploadDir, file.filename);
    
    // We run this asynchronously and don't wait for it to finish for the HTTP response
    // But for a simple MVP, we might want to wait or just return "Processing started"
    
    // Let's run it and capture output
    console.log(`Starting python process for ${filePath}`);
    const pythonProcess = spawn("python3", [scriptPath, filePath, processedDir]);

    let dataBuffer = "";
    let errorBuffer = "";

    pythonProcess.stdout.on("data", (data) => {
      dataBuffer += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      errorBuffer += data.toString();
      console.error(`Python stderr: ${data}`);
    });

    pythonProcess.on("close", async (code) => {
      console.log(`Python process exited with code ${code}`);
      
      if (code === 0) {
        try {
          // Parse JSON output from Python script
          // Python script should print JSON to stdout
          const result = JSON.parse(dataBuffer);
          await storage.updateFileStatus(id, "completed", result);
        } catch (e) {
          console.error("Failed to parse Python output:", e);
          await storage.updateFileStatus(id, "error", undefined, "Failed to parse processing result");
        }
      } else {
        await storage.updateFileStatus(id, "error", undefined, errorBuffer || "Process failed");
      }
    });

    res.json({ message: "Processing started", status: "processing" });
  });

  // DELETE /api/files/:id
  app.delete(api.files.delete.path, async (req, res) => {
    const id = parseInt(req.params.id);
    const file = await storage.getFile(id);
    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }

    // Delete file from disk
    const filePath = path.join(uploadDir, file.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete processed file if exists
    // We assume processed file naming convention in python script
    
    await storage.deleteFile(id);
    res.status(204).send();
  });
  
  // Download endpoint
  app.get("/api/files/:id/download", async (req, res) => {
    const id = parseInt(req.params.id);
    const file = await storage.getFile(id);
    if (!file) return res.status(404).send("File not found");
    
    // If completed, download processed. Else original.
    let filePath;
    if (file.status === 'completed') {
       // Python script saves as "processed_<filename>"? Let's check python script logic.
       // We'll standardize on `processed_<filename>`
       filePath = path.join(processedDir, `processed_${file.filename}`);
       if (!fs.existsSync(filePath)) {
         // Fallback to original if processed not found (e.g. only stats computed)
         filePath = path.join(uploadDir, file.filename);
       }
    } else {
       filePath = path.join(uploadDir, file.filename);
    }
    
    res.download(filePath, file.originalName);
  });

  return httpServer;
}
