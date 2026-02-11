import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const files = pgTable("files", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  status: text("status", { enum: ["uploaded", "processing", "completed", "error"] }).default("uploaded").notNull(),
  stats: jsonb("stats").$type<{
    rowCount?: number;
    columnCount?: number;
    missingValues?: Record<string, number>;
    columnTypes?: Record<string, string>;
    preview?: any[];
  }>(),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertFileSchema = createInsertSchema(files).omit({ 
  id: true, 
  createdAt: true, 
  status: true, 
  stats: true, 
  error: true 
});

export type File = typeof files.$inferSelect;
export type InsertFile = z.infer<typeof insertFileSchema>;

export type FileResponse = File;
