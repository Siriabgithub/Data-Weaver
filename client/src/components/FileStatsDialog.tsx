import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type FileResponse } from "@shared/routes";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from "recharts";
import { FileText, Database, AlertCircle } from "lucide-react";

interface FileStatsDialogProps {
  file: FileResponse | null;
  isOpen: boolean;
  onClose: () => void;
}

export function FileStatsDialog({ file, isOpen, onClose }: FileStatsDialogProps) {
  if (!file || !file.stats) return null;

  const stats = file.stats as any;
  const missingData = Object.entries(stats.missingValues || {}).map(([key, value]) => ({
    name: key,
    value: value,
  }));

  const hasMissingValues = missingData.some((d: any) => d.value > 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            {file.originalName} Analysis
          </DialogTitle>
          <DialogDescription>
            Detailed statistics and quality report for your dataset.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Rows</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.rowCount?.toLocaleString() || 0}</div>
              <p className="text-xs text-muted-foreground">Records processed</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Columns</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.columnCount || 0}</div>
              <p className="text-xs text-muted-foreground">Attributes per record</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Data Quality</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {hasMissingValues ? "Issues Found" : "Clean"}
              </div>
              <p className="text-xs text-muted-foreground">
                {hasMissingValues 
                  ? "Missing values detected" 
                  : "No missing values detected"}
              </p>
            </CardContent>
          </Card>
        </div>

        {hasMissingValues && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-4">Missing Values Distribution</h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={missingData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={100} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]}>
                    {missingData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.value > (stats.rowCount || 0) * 0.1 ? "hsl(var(--destructive))" : "hsl(var(--primary))"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {stats.columnTypes && (
          <div className="mt-6">
             <h3 className="text-lg font-semibold mb-4">Detected Schema</h3>
             <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
               {Object.entries(stats.columnTypes).map(([col, type]: [string, any]) => (
                 <div key={col} className="bg-muted/50 p-3 rounded-lg border border-border/50">
                   <div className="font-medium truncate" title={col}>{col}</div>
                   <div className="text-xs text-muted-foreground uppercase mt-1">{type}</div>
                 </div>
               ))}
             </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
