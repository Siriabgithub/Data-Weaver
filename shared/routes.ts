import { z } from 'zod';
import { insertFileSchema, files } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  files: {
    list: {
      method: 'GET' as const,
      path: '/api/files' as const,
      responses: {
        200: z.array(z.custom<typeof files.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/files/:id' as const,
      responses: {
        200: z.custom<typeof files.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    upload: {
      method: 'POST' as const,
      path: '/api/files' as const,
      // Input is FormData, not strictly typed here but handled in implementation
      responses: {
        201: z.custom<typeof files.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    process: {
      method: 'POST' as const,
      path: '/api/files/:id/process' as const,
      input: z.object({
        operations: z.array(z.string()).optional(), // e.g. ["remove_duplicates", "fill_missing"]
      }).optional(),
      responses: {
        200: z.object({ message: z.string(), status: z.string() }),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/files/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type FileResponse = z.infer<typeof api.files.list.responses[200]>[number];
