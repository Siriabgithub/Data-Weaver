import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileType, AlertCircle, Loader2 } from "lucide-react";
import { useUploadFile } from "@/hooks/use-files";
import { cn } from "@/lib/utils";

export function UploadZone() {
  const { mutate: uploadFile, isPending } = useUploadFile();
  const [dragActive, setDragActive] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      const formData = new FormData();
      formData.append("file", file);
      uploadFile(formData);
    }
  }, [uploadFile]);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    maxFiles: 1,
    multiple: false,
    accept: {
      'text/csv': ['.csv'],
      'application/json': ['.json'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'application/octet-stream': ['.data'],
      'text/plain': ['.txt', '.data'],
    }
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "relative overflow-hidden rounded-2xl border-2 border-dashed p-12 transition-all duration-300 ease-in-out cursor-pointer group",
        isDragActive 
          ? "border-primary bg-primary/5 scale-[1.01] shadow-xl" 
          : "border-border hover:border-primary/50 hover:bg-muted/30",
        isDragReject && "border-destructive bg-destructive/5",
        "bg-white dark:bg-card"
      )}
    >
      <input {...getInputProps()} />
      
      <div className="flex flex-col items-center justify-center text-center space-y-4">
        <div className={cn(
          "p-4 rounded-full transition-colors duration-300",
          isDragActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
        )}>
          {isPending ? (
            <Loader2 className="w-8 h-8 animate-spin" />
          ) : (
            <Upload className="w-8 h-8" />
          )}
        </div>
        
        <div className="space-y-1">
          <h3 className="text-xl font-semibold font-display">
            {isDragActive ? "Drop your file here" : "Upload your dataset"}
          </h3>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            Drag and drop or click to browse. We support CSV, Excel, JSON, .data, and Images.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2 mt-4 opacity-60">
          <Badge variant="outline">CSV</Badge>
          <Badge variant="outline">Excel</Badge>
          <Badge variant="outline">JSON</Badge>
          <Badge variant="outline">.data</Badge>
          <Badge variant="outline">Images</Badge>
        </div>
      </div>

      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent" />
    </div>
  );
}

function Badge({ children, variant = "default", className }: { children: React.ReactNode, variant?: "default" | "outline", className?: string }) {
  return (
    <span className={cn(
      "px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors",
      variant === "outline" 
        ? "border-border text-muted-foreground bg-transparent" 
        : "border-transparent bg-primary text-primary-foreground",
      className
    )}>
      {children}
    </span>
  );
}
