import { files, type File, type InsertFile } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  getFiles(): Promise<File[]>;
  getFile(id: number): Promise<File | undefined>;
  createFile(file: InsertFile): Promise<File>;
  updateFileStatus(id: number, status: string, stats?: any, error?: string): Promise<File>;
  deleteFile(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getFiles(): Promise<File[]> {
    return await db.select().from(files).orderBy(files.createdAt);
  }

  async getFile(id: number): Promise<File | undefined> {
    const [file] = await db.select().from(files).where(eq(files.id, id));
    return file;
  }

  async createFile(insertFile: InsertFile): Promise<File> {
    const [file] = await db.insert(files).values(insertFile).returning();
    return file;
  }

  async updateFileStatus(id: number, status: string, stats?: any, error?: string): Promise<File> {
    const updates: any = { status };
    if (stats) updates.stats = stats;
    if (error) updates.error = error;
    
    const [updated] = await db
      .update(files)
      .set(updates)
      .where(eq(files.id, id))
      .returning();
    return updated;
  }

  async deleteFile(id: number): Promise<void> {
    await db.delete(files).where(eq(files.id, id));
  }
}

export const storage = new DatabaseStorage();
