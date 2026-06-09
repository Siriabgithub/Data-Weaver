import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { type FileResponse } from "@shared/routes";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  FileText,
  Database,
  AlertCircle,
  CheckCircle2,
  Timer,
  TrendingUp,
  Info,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FileStatsDialogProps {
  file: FileResponse | null;
  isOpen: boolean;
  onClose: () => void;
}

function StatCard({
  title,
  value,
  sub,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function FileStatsDialog({ file, isOpen, onClose }: FileStatsDialogProps) {
  if (!file || !file.stats) return null;

  const stats = file.stats as any;

  // ── Missing values chart data ──────────────────────────
  const missingData = Object.entries(stats.missingValues || {})
    .map(([key, value]) => ({ name: key, value: value as number }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 30); // cap at 30 for legibility

  const hasMissingValues = missingData.length > 0;
  const totalMissing = Object.values(stats.missingValues || {}).reduce(
    (acc: number, v) => acc + (v as number),
    0
  );

  // ── Numeric stats table ───────────────────────────────
  const numericCols = Object.keys(stats.numericStats || {});

  // ── Formatting helpers ────────────────────────────────
  const fmt = (v: number | null | undefined) => {
    if (v == null || isNaN(v)) return "—";
    if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(2) + "M";
    if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(1) + "K";
    return v.toFixed(2);
  };

  const fmtTime = (s: number) =>
    s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${(s % 60).toFixed(0)}s`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0">
        {/* Fixed header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-2xl font-display flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            {file.originalName}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-3 mt-1">
            <span>Quality report &amp; statistics for your dataset</span>
            {stats.isSampled && (
              <Badge variant="outline" className="text-xs border-amber-300 text-amber-700">
                <Info className="w-3 h-3 mr-1" />
                Large dataset — some stats sampled from {stats.sampleSize?.toLocaleString()} rows
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-y-auto px-6 pb-6">
          {/* ── Summary cards ──────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
            <StatCard
              title="Total Rows"
              value={stats.rowCount?.toLocaleString() ?? 0}
              sub="Records processed"
              icon={Database}
            />
            <StatCard
              title="Total Columns"
              value={stats.columnCount ?? 0}
              sub="Attributes per record"
              icon={TrendingUp}
            />
            <StatCard
              title="Missing Values"
              value={totalMissing > 0 ? totalMissing.toLocaleString() : "None"}
              sub={
                totalMissing > 0
                  ? `Across ${missingData.length} column${missingData.length !== 1 ? "s" : ""}`
                  : "Dataset is complete"
              }
              icon={AlertCircle}
            />
            <StatCard
              title="Duplicates Removed"
              value={stats.duplicatesRemoved?.toLocaleString() ?? 0}
              sub={stats.duplicateNote || "During cleaning"}
              icon={CheckCircle2}
            />
          </div>

          {/* Processing time */}
          {stats.processingTime != null && (
            <div className="flex items-center gap-2 mt-4 text-sm text-muted-foreground">
              <Timer className="w-4 h-4" />
              Processed in <strong className="text-foreground">{fmtTime(stats.processingTime)}</strong>
            </div>
          )}

          {/* ── Missing values chart ───────────────────────── */}
          {hasMissingValues && (
            <div className="mt-6">
              <h3 className="text-base font-semibold mb-3">
                Missing Values by Column
              </h3>
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={missingData}
                    layout="vertical"
                    margin={{ top: 2, right: 30, left: 20, bottom: 2 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={110}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "none",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                        fontSize: "12px",
                      }}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {missingData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            entry.value > (stats.rowCount || 0) * 0.1
                              ? "hsl(var(--destructive))"
                              : "hsl(var(--primary))"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── Numeric statistics table ───────────────────── */}
          {numericCols.length > 0 && (
            <div className="mt-6">
              <h3 className="text-base font-semibold mb-3">Numeric Column Statistics</h3>
              <div className="overflow-x-auto rounded-lg border border-border/50">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Column</th>
                      <th className="text-right px-3 py-2 font-medium">Count</th>
                      <th className="text-right px-3 py-2 font-medium">Mean</th>
                      <th className="text-right px-3 py-2 font-medium">Std Dev</th>
                      <th className="text-right px-3 py-2 font-medium">Min</th>
                      <th className="text-right px-3 py-2 font-medium">25%</th>
                      <th className="text-right px-3 py-2 font-medium">Median</th>
                      <th className="text-right px-3 py-2 font-medium">75%</th>
                      <th className="text-right px-3 py-2 font-medium">Max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {numericCols.map((col, i) => {
                      const s = stats.numericStats[col] || {};
                      return (
                        <tr
                          key={col}
                          className={i % 2 === 0 ? "bg-white" : "bg-muted/20"}
                        >
                          <td
                            className="px-3 py-1.5 font-medium truncate max-w-[120px]"
                            title={col}
                          >
                            {col}
                          </td>
                          <td className="text-right px-3 py-1.5 tabular-nums">{fmt(s.count)}</td>
                          <td className="text-right px-3 py-1.5 tabular-nums">{fmt(s.mean)}</td>
                          <td className="text-right px-3 py-1.5 tabular-nums">{fmt(s.std)}</td>
                          <td className="text-right px-3 py-1.5 tabular-nums">{fmt(s.min)}</td>
                          <td className="text-right px-3 py-1.5 tabular-nums">{fmt(s["25%"])}</td>
                          <td className="text-right px-3 py-1.5 tabular-nums">{fmt(s["50%"])}</td>
                          <td className="text-right px-3 py-1.5 tabular-nums">{fmt(s["75%"])}</td>
                          <td className="text-right px-3 py-1.5 tabular-nums">{fmt(s.max)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {stats.isSampled && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  ⓘ Stats computed on a {stats.sampleSize?.toLocaleString()}-row sample for performance.
                </p>
              )}
            </div>
          )}

          {/* ── Data preview ──────────────────────────────── */}
          {stats.preview && stats.preview.length > 0 && (
            <div className="mt-6">
              <h3 className="text-base font-semibold mb-3">
                Data Preview{" "}
                <span className="text-muted-foreground font-normal text-sm">
                  (first {stats.preview.length} rows)
                </span>
              </h3>
              <div className="overflow-x-auto rounded-lg border border-border/50 text-xs">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      {Object.keys(stats.preview[0] || {})
                        .slice(0, 12)
                        .map((col) => (
                          <th
                            key={col}
                            className="text-left px-3 py-2 font-medium whitespace-nowrap truncate max-w-[120px]"
                            title={col}
                          >
                            {col}
                          </th>
                        ))}
                      {Object.keys(stats.preview[0] || {}).length > 12 && (
                        <th className="px-3 py-2 text-muted-foreground">
                          +{Object.keys(stats.preview[0]).length - 12} more
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.preview.slice(0, 10).map((row: any, i: number) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-muted/20"}>
                        {Object.values(row)
                          .slice(0, 12)
                          .map((val: any, j: number) => (
                            <td
                              key={j}
                              className="px-3 py-1.5 truncate max-w-[120px] tabular-nums"
                              title={val == null ? "null" : String(val)}
                            >
                              {val == null ? (
                                <span className="text-muted-foreground italic">null</span>
                              ) : (
                                String(val).slice(0, 30)
                              )}
                            </td>
                          ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Detected schema ───────────────────────────── */}
          {stats.columnTypes && Object.keys(stats.columnTypes).length > 0 && (
            <div className="mt-6">
              <h3 className="text-base font-semibold mb-3">Detected Schema</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {Object.entries(stats.columnTypes).map(([col, type]: [string, any]) => (
                  <div
                    key={col}
                    className="bg-muted/40 p-2.5 rounded-lg border border-border/40"
                    data-testid={`schema-col-${col}`}
                  >
                    <div className="font-medium truncate text-xs" title={col}>
                      {col}
                    </div>
                    <div className="text-xs text-muted-foreground uppercase mt-0.5 font-mono">
                      {type}
                    </div>
                  </div>
                ))}
                {Object.keys(stats.columnTypes).length < (stats.columnCount || 0) && (
                  <div className="bg-muted/20 p-2.5 rounded-lg border border-border/40 flex items-center justify-center text-xs text-muted-foreground">
                    +{(stats.columnCount || 0) - Object.keys(stats.columnTypes).length} more
                  </div>
                )}
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
