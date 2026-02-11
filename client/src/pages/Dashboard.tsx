import { useState } from "react";
import { useFiles, useProcessFile, useDeleteFile } from "@/hooks/use-files";
import { UploadZone } from "@/components/UploadZone";
import { FileStatsDialog } from "@/components/FileStatsDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  FileText, 
  Trash2, 
  Play, 
  Download, 
  BarChart2, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle,
  Clock
} from "lucide-react";
import { format } from "date-fns";
import { type FileResponse } from "@shared/routes";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const { data: files, isLoading } = useFiles();
  const { mutate: processFile, isPending: isProcessing } = useProcessFile();
  const { mutate: deleteFile, isPending: isDeleting } = useDeleteFile();
  const [selectedFile, setSelectedFile] = useState<FileResponse | null>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'uploaded':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-100"><Clock className="w-3 h-3 mr-1" /> Ready</Badge>;
      case 'processing':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100 animate-pulse"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Processing</Badge>;
      case 'completed':
        return <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100"><CheckCircle2 className="w-3 h-3 mr-1" /> Cleaned</Badge>;
      case 'error':
        return <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100"><AlertTriangle className="w-3 h-3 mr-1" /> Error</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
          <p className="text-muted-foreground animate-pulse">Loading workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="border-b bg-white/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold">
              AI
            </div>
            <h1 className="text-xl font-bold font-display tracking-tight text-foreground">DataCleanse AI</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground hidden sm:block">
              Intelligent Data Processing Pipeline
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Upload Section */}
        <section>
          <div className="mb-4">
            <h2 className="text-2xl font-bold font-display text-foreground">Upload Dataset</h2>
            <p className="text-muted-foreground">Upload your raw data files for AI-powered cleaning and analysis.</p>
          </div>
          <UploadZone />
        </section>

        {/* Files List */}
        <section>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold font-display text-foreground">Your Datasets</h2>
              <p className="text-muted-foreground">Manage and process your uploaded files.</p>
            </div>
          </div>

          <Card className="overflow-hidden border shadow-sm bg-white/50 backdrop-blur-sm">
            {files && files.length > 0 ? (
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="w-[300px]">Filename</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {files.map((file) => (
                    <TableRow key={file.id} className="group hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-md bg-primary/10 text-primary">
                            <FileText className="w-4 h-4" />
                          </div>
                          <span className="truncate max-w-[200px]" title={file.originalName}>
                            {file.originalName}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs uppercase">
                        {file.originalName.split('.').pop()}
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {formatFileSize(file.size)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {format(new Date(file.createdAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>{getStatusBadge(file.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {file.status === 'uploaded' && (
                            <Button
                              size="sm"
                              className="bg-primary hover:bg-primary/90 shadow-md shadow-primary/20"
                              onClick={() => processFile({ id: file.id, operations: ["auto_clean"] })}
                              disabled={isProcessing}
                            >
                              <Play className="w-4 h-4 mr-1.5" />
                              Process
                            </Button>
                          )}
                          
                          {file.status === 'completed' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-primary/20 hover:border-primary/50 hover:bg-primary/5 text-primary"
                                onClick={() => setSelectedFile(file)}
                              >
                                <BarChart2 className="w-4 h-4 mr-1.5" />
                                Analysis
                              </Button>
                              <Button
                                size="sm"
                                variant="default"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20"
                                onClick={() => window.open(`/api/files/${file.id}/download`, '_blank')}
                              >
                                <Download className="w-4 h-4 mr-1.5" />
                                Export
                              </Button>
                            </>
                          )}

                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => deleteFile(file.id)}
                            disabled={isDeleting}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                  <FileText className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground">No files yet</h3>
                <p className="text-muted-foreground max-w-sm mt-1">
                  Upload a file above to get started with AI-powered data cleaning.
                </p>
              </div>
            )}
          </Card>
        </section>
      </main>

      <FileStatsDialog 
        file={selectedFile} 
        isOpen={!!selectedFile} 
        onClose={() => setSelectedFile(null)} 
      />
    </div>
  );
}
