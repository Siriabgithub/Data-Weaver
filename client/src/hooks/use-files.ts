import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useFiles() {
  return useQuery({
    queryKey: [api.files.list.path],
    queryFn: async () => {
      const res = await fetch(api.files.list.path);
      if (!res.ok) throw new Error("Failed to fetch files");
      return api.files.list.responses[200].parse(await res.json());
    },
    refetchInterval: 3000, // Auto-refresh every 3s to check processing status
  });
}

export function useFile(id: number | null) {
  return useQuery({
    queryKey: [api.files.get.path, id],
    queryFn: async () => {
      if (!id) return null;
      const url = buildUrl(api.files.get.path, { id });
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch file details");
      return api.files.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useUploadFile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch(api.files.upload.path, {
        method: api.files.upload.method,
        body: formData,
        // Content-Type header is set automatically by browser for FormData
      });
      
      if (!res.ok) {
        if (res.status === 400) {
          const error = await res.json();
          throw new Error(error.message || "Invalid file");
        }
        throw new Error("Upload failed");
      }
      return api.files.upload.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.files.list.path] });
      toast({
        title: "File uploaded successfully",
        description: "Your file is ready for processing.",
      });
    },
    onError: (error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useProcessFile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, operations }: { id: number; operations?: string[] }) => {
      const url = buildUrl(api.files.process.path, { id });
      const res = await fetch(url, {
        method: api.files.process.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operations }),
      });

      if (!res.ok) throw new Error("Processing failed to start");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.files.list.path] });
      toast({
        title: "Processing started",
        description: "We are cleaning your data. This may take a moment.",
      });
    },
    onError: (error) => {
      toast({
        title: "Processing failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteFile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.files.delete.path, { id });
      const res = await fetch(url, { method: api.files.delete.method });
      if (!res.ok) throw new Error("Failed to delete file");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.files.list.path] });
      toast({
        title: "File deleted",
        description: "The file has been permanently removed.",
      });
    },
    onError: (error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
