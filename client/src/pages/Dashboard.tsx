import { useState } from "react";
import { useFiles, useProcessFile, useDeleteFile } from "@/hooks/use-files";
import { UploadZone } from "@/components/UploadZone";
import { FileStatsDialog } from "@/components/FileStatsDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  FileText,
  Trash2,
  Play,
  Download,
  BarChart2,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  ChevronDown,
  Info,
  Database,
  Timer,
} from "lucide-react";
import { format } from "date-fns";
import { type FileResponse } from "@shared/routes";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const { data: files, isLoading } = useFiles();
  const { mutate: processFile, isPending: isProcessing } = useProcessFile();
  const { mutate: deleteFile, isPending: isDeleting } = useDeleteFile();
  const [selectedFile, setSelectedFile] = useState<FileResponse | null>(null);
  const [expandedError, setExpandedError] = useState<number | null>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    return `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(0)}s`;
  };

  const getStats = (file: FileResponse) => (file.stats as any) || {};

  const getStatusBadge = (file: FileResponse) => {
    const stats = getStats(file);
    switch (file.status) {
      case "uploaded":
        return (
          <Badge
            variant="secondary"
            className="bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-100"
            data-testid={`status-uploaded-${file.id}`}
          >
            <Clock className="w-3 h-3 mr-1" /> Ready
          </Badge>
        );
      case "processing": {
        const pct = typeof stats.progress === "number" ? stats.progress : null;
        const phase = stats.phase || "Processing";
        return (
          <div
            className="flex flex-col gap-1 min-w-[130px]"
            data-testid={`status-processing-${file.id}`}
          >
            <Badge
              variant="secondary"
              className="bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100 w-fit"
            >
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              {phase}
            </Badge>
            {pct !== null && (
              <div className="flex items-center gap-2">
                <Progress value={pct} className="h-1.5 flex-1" />
                <span className="text-xs text-muted-foreground tabular-nums">
                  {pct}%
                </span>
              </div>
            )}
          </div>
        );
      }
      case "completed":
        return (
          <Badge
            variant="secondary"
            className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100"
            data-testid={`status-completed-${file.id}`}
          >
            <CheckCircle2 className="w-3 h-3 mr-1" /> Cleaned
          </Badge>
        );
      case "error":
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="destructive"
                className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100 cursor-help"
                data-testid={`status-error-${file.id}`}
              >
                <AlertTriangle className="w-3 h-3 mr-1" /> Failed
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-[300px] text-xs break-words">
              {file.error
                ? file.error.split("\n")[0]
                : "An unknown error occurred."}
            </TooltipContent>
          </Tooltip>
        );
      default:
        return <Badge variant="outline">{file.status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
          <p className="text-muted-foreground animate-pulse">
            Loading workspace…
          </p>
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
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-sm">
              AI
            </div>
            <h1 className="text-xl font-bold font-display tracking-tight text-foreground">
              DataCleanse AI
            </h1>
          </div>
          <div className="text-sm text-muted-foreground hidden sm:block">
            Intelligent Data Processing Pipeline
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Upload */}
        <section>
          <div className="mb-4">
            <h2 className="text-2xl font-bold font-display text-foreground">
              Upload Dataset
            </h2>
            <p className="text-muted-foreground">
              Upload your raw data files for AI-powered cleaning and analysis.
            </p>
          </div>
          <UploadZone />
        </section>

        {/* Files list */}
        <section>
          <div className="mb-4">
            <h2 className="text-2xl font-bold font-display text-foreground">
              Your Datasets
            </h2>
            <p className="text-muted-foreground">
              Manage and process your uploaded files.
            </p>
          </div>

          <Card className="overflow-hidden border shadow-sm bg-white/50 backdrop-blur-sm">
            {files && files.length > 0 ? (
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="w-[240px]">Filename</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Rows / Cols</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead className="min-w-[160px]">Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {files.flatMap((file) => {
                    const stats = getStats(file);
                    const hasError = file.status === "error" && !!file.error;
                    const isErrorExpanded = expandedError === file.id;

                    const mainRow = (
                      <TableRow
                        key={`main-${file.id}`}
                        className="group hover:bg-muted/30 transition-colors align-top"
                        data-testid={`row-file-${file.id}`}
                      >
                        <TableCell className="font-medium py-3">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-md bg-primary/10 text-primary shrink-0">
                              <FileText className="w-4 h-4" />
                            </div>
                            <span
                              className="truncate max-w-[160px]"
                              title={file.originalName}
                              data-testid={`text-filename-${file.id}`}
                            >
                              {file.originalName}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell className="text-muted-foreground text-xs uppercase py-3">
                          {file.originalName.split(".").pop()}
                        </TableCell>

                        <TableCell
                          className="text-muted-foreground font-mono text-xs py-3"
                          data-testid={`text-size-${file.id}`}
                        >
                          {formatFileSize(file.size)}
                        </TableCell>

                        <TableCell className="text-xs py-3">
                          {stats.rowCount != null ? (
                            <div className="flex flex-col gap-0.5">
                              <span
                                className="font-medium tabular-nums"
                                data-testid={`text-rows-${file.id}`}
                              >
                                {stats.rowCount.toLocaleString()} rows
                              </span>
                              <span className="text-muted-foreground">
                                {stats.columnCount} cols
                              </span>
                              {stats.processingTime != null && (
                                <span className="text-muted-foreground flex items-center gap-1">
                                  <Timer className="w-3 h-3" />
                                  {formatTime(stats.processingTime)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        <TableCell className="text-muted-foreground text-sm py-3">
                          {format(new Date(file.createdAt), "MMM d, yyyy")}
                        </TableCell>

                        <TableCell className="py-3">
                          {getStatusBadge(file)}
                        </TableCell>

                        <TableCell className="text-right py-3">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            {/* Process / Retry */}
                            {(file.status === "uploaded" ||
                              file.status === "error") && (
                              <Button
                                size="sm"
                                className={cn(
                                  "shadow-md",
                                  file.status === "error"
                                    ? "bg-orange-500 hover:bg-orange-600 shadow-orange-500/20"
                                    : "bg-primary hover:bg-primary/90 shadow-primary/20"
                                )}
                                onClick={() =>
                                  processFile({
                                    id: file.id,
                                    operations: ["auto_clean"],
                                  })
                                }
                                disabled={isProcessing}
                                data-testid={`button-process-${file.id}`}
                              >
                                {file.status === "error" ? (
                                  <>
                                    <RefreshCw className="w-4 h-4 mr-1.5" />{" "}
                                    Retry
                                  </>
                                ) : (
                                  <>
                                    <Play className="w-4 h-4 mr-1.5" /> Process
                                  </>
                                )}
                              </Button>
                            )}

                            {/* Error detail toggle */}
                            {hasError && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-red-200 hover:border-red-400 hover:bg-red-50 text-red-700"
                                onClick={() =>
                                  setExpandedError(
                                    isErrorExpanded ? null : file.id
                                  )
                                }
                                data-testid={`button-error-detail-${file.id}`}
                              >
                                <Info className="w-4 h-4 mr-1" />
                                Details
                                <ChevronDown
                                  className={cn(
                                    "w-3 h-3 ml-1 transition-transform",
                                    isErrorExpanded && "rotate-180"
                                  )}
                                />
                              </Button>
                            )}

                            {/* Analysis + Export for completed */}
                            {file.status === "completed" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-primary/20 hover:border-primary/50 hover:bg-primary/5 text-primary"
                                  onClick={() => setSelectedFile(file)}
                                  data-testid={`button-analysis-${file.id}`}
                                >
                                  <BarChart2 className="w-4 h-4 mr-1.5" />
                                  Analysis
                                </Button>
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20"
                                  onClick={() =>
                                    window.open(
                                      `/api/files/${file.id}/download`,
                                      "_blank"
                                    )
                                  }
                                  data-testid={`button-export-${file.id}`}
                                >
                                  <Download className="w-4 h-4 mr-1.5" />
                                  Export
                                </Button>
                              </>
                            )}

                            {/* Delete */}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={() => deleteFile(file.id)}
                              disabled={
                                isDeleting || file.status === "processing"
                              }
                              data-testid={`button-delete-${file.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );

                    const errorRow =
                      hasError && isErrorExpanded ? (
                        <TableRow
                          key={`error-${file.id}`}
                          className="bg-red-50/50"
                        >
                          <TableCell colSpan={7} className="py-0">
                            <div className="py-3 px-4">
                              <p className="text-xs font-semibold text-red-700 mb-2 flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" /> Error
                                Details
                              </p>
                              <pre
                                className="text-xs text-red-900 bg-red-100/80 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap font-mono max-h-60 overflow-y-auto"
                                data-testid={`text-error-${file.id}`}
                              >
                                {file.error}
                              </pre>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null;

                    return errorRow ? [mainRow, errorRow] : [mainRow];
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                  <Database className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground">
                  No files yet
                </h3>
                <p className="text-muted-foreground max-w-sm mt-1">
                  Upload a dataset above to get started with AI-powered data
                  cleaning.
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
