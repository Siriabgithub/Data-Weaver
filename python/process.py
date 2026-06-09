import sys
import pandas as pd
import numpy as np
import json
import os
import gc
import time
import traceback
import warnings
import io

warnings.filterwarnings('ignore')

# ──────────────────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────────────────
LARGE_ROW_THRESHOLD = 100_000   # rows above this trigger sampling for some ops
PREVIEW_ROWS = 100              # rows returned in preview payload
SAMPLE_SIZE = 10_000            # rows sampled for numeric describe on large frames
MAX_COLS_REPORT = 200           # max columns included in stats payload
CHUNK_SIZE = 50_000             # rows per chunk for I/O

# ──────────────────────────────────────────────────────────
# Logging / Progress helpers
# ──────────────────────────────────────────────────────────

def log_progress(pct: int, phase: str):
    """Write a parseable progress line to stderr."""
    sys.stderr.write(f"PROGRESS:{pct}:{phase}\n")
    sys.stderr.flush()

def log_info(msg: str):
    sys.stderr.write(f"INFO:{time.strftime('%H:%M:%S')} {msg}\n")
    sys.stderr.flush()

# ──────────────────────────────────────────────────────────
# JSON-safe serialisation
# ──────────────────────────────────────────────────────────

def _to_python(v):
    """Convert numpy/pandas scalars to JSON-native Python types."""
    if v is None:
        return None
    if isinstance(v, float) and np.isnan(v):
        return None
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        return float(v)
    if isinstance(v, (np.bool_,)):
        return bool(v)
    if isinstance(v, pd.Timestamp):
        return str(v)
    if isinstance(v, np.ndarray):
        return v.tolist()
    return v

def safe_serialize(obj):
    """Deeply convert a nested structure to JSON-safe types."""
    if isinstance(obj, dict):
        return {str(k): safe_serialize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [safe_serialize(v) for v in obj]
    return _to_python(obj)

# ──────────────────────────────────────────────────────────
# Readers
# ──────────────────────────────────────────────────────────

def detect_encoding(file_path: str) -> str:
    candidates = ['utf-8', 'latin-1', 'iso-8859-1', 'cp1252']
    for enc in candidates:
        try:
            with open(file_path, 'r', encoding=enc) as f:
                f.read(8192)
            return enc
        except (UnicodeDecodeError, LookupError):
            continue
    return 'latin-1'   # last-resort


def read_excel_safe(file_path: str) -> pd.DataFrame:
    """
    Memory-efficient Excel reader.
    1. Attempts standard pd.read_excel (works for moderate files).
    2. On MemoryError, falls back to openpyxl read_only streaming mode.
    """
    file_size = os.path.getsize(file_path)
    log_info(f"Reading Excel file ({file_size/1024/1024:.1f} MB)")

    try:
        df = pd.read_excel(file_path, engine='openpyxl')
        log_info(f"Excel loaded: {len(df):,} rows × {len(df.columns)} cols")
        return df
    except MemoryError:
        log_info("Standard read OOM – switching to openpyxl streaming mode")

    import openpyxl
    wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
    ws = wb.active

    rows_iter = ws.iter_rows(values_only=True)
    raw_header = next(rows_iter, None)
    if raw_header is None:
        wb.close()
        raise ValueError("Excel file appears to be empty (no rows found).")

    header = [
        str(h).strip() if h is not None else f'Column_{i+1}'
        for i, h in enumerate(raw_header)
    ]

    chunks = []
    batch = []
    row_count = 0

    for row in rows_iter:
        batch.append(row)
        row_count += 1
        if len(batch) >= CHUNK_SIZE:
            chunks.append(pd.DataFrame(batch, columns=header))
            batch = []
            gc.collect()
            log_info(f"  streamed {row_count:,} rows…")

    if batch:
        chunks.append(pd.DataFrame(batch, columns=header))

    wb.close()
    del batch

    if not chunks:
        return pd.DataFrame(columns=header)

    df = pd.concat(chunks, ignore_index=True)
    del chunks
    gc.collect()

    log_info(f"Excel streaming complete: {len(df):,} rows × {len(df.columns)} cols")
    return df


def read_csv_safe(file_path: str) -> pd.DataFrame:
    """Read CSV with encoding detection, chunked loading on MemoryError."""
    file_size = os.path.getsize(file_path)
    encoding = detect_encoding(file_path)
    log_info(f"Reading CSV file ({file_size/1024/1024:.1f} MB, encoding={encoding})")

    try:
        df = pd.read_csv(file_path, encoding=encoding, low_memory=False)
        log_info(f"CSV loaded: {len(df):,} rows × {len(df.columns)} cols")
        return df
    except MemoryError:
        log_info("CSV read OOM – switching to chunked read")

    chunks = []
    for i, chunk in enumerate(pd.read_csv(
        file_path, encoding=encoding, chunksize=CHUNK_SIZE, low_memory=False
    )):
        chunks.append(chunk)
        gc.collect()
        log_info(f"  loaded chunk {i+1} ({(i+1)*CHUNK_SIZE:,} rows)")

    df = pd.concat(chunks, ignore_index=True)
    del chunks
    gc.collect()
    log_info(f"CSV chunked load complete: {len(df):,} rows × {len(df.columns)} cols")
    return df


def read_json_safe(file_path: str) -> pd.DataFrame:
    encoding = detect_encoding(file_path)
    try:
        return pd.read_json(file_path, encoding=encoding)
    except ValueError:
        # Try as JSON Lines
        return pd.read_json(file_path, lines=True, encoding=encoding)


def read_txt_safe(file_path: str) -> pd.DataFrame:
    encoding = detect_encoding(file_path)
    try:
        return pd.read_csv(file_path, sep=None, engine='python', encoding=encoding)
    except Exception:
        with open(file_path, 'r', encoding=encoding) as f:
            content = f.read()
        return pd.DataFrame({'content': [content]})


# ──────────────────────────────────────────────────────────
# .data file parser (robust)
# ──────────────────────────────────────────────────────────

def parse_data_file(file_path: str) -> pd.DataFrame:
    encoding = detect_encoding(file_path)
    with open(file_path, 'r', encoding=encoding) as f:
        raw_text = f.read().strip()

    if not raw_text:
        raise ValueError("The .data file is empty.")

    lines = [l for l in raw_text.splitlines() if l.strip()]
    if not lines:
        raise ValueError("The .data file contains no data rows.")

    # Auto-detect delimiter
    candidate_delimiters = [',', ';', '\t', '|', ' ']
    delimiter = ','
    best_count = 0
    for delim in candidate_delimiters:
        count = lines[0].count(delim)
        if count > best_count:
            best_count = count
            delimiter = delim

    if delimiter == ' ':
        lines = [' '.join(l.split()) for l in lines]

    # Determine if first row is a header
    def is_numeric_token(tok):
        try:
            float(tok)
            return True
        except (ValueError, TypeError):
            return False

    first_tokens = [
        t.strip()
        for t in (lines[0].split() if delimiter == ' ' else lines[0].split(delimiter))
    ]
    first_row_has_numbers = any(is_numeric_token(t) for t in first_tokens)
    infer_header = None if first_row_has_numbers else 'infer'

    try:
        df = pd.read_csv(
            io.StringIO('\n'.join(lines)),
            sep=delimiter,
            header=infer_header,
            engine='python',
            on_bad_lines='warn',
        )
        if infer_header is None:
            df.columns = [f'Column_{i+1}' for i in range(len(df.columns))]
        else:
            cols = df.columns.tolist()
            if all(str(c).startswith('Unnamed') for c in cols):
                df.columns = [f'Column_{i+1}' for i in range(len(df.columns))]
        return df
    except Exception:
        pass

    # Manual fallback: parse line-by-line, pad uneven rows
    parsed_rows = []
    for line in lines:
        row = line.split() if delimiter == ' ' else line.split(delimiter)
        parsed_rows.append(row)

    max_cols = max(len(r) for r in parsed_rows)
    padded = [r + [None] * (max_cols - len(r)) for r in parsed_rows]

    def looks_numeric(v):
        if v is None:
            return False
        try:
            float(v)
            return True
        except (ValueError, TypeError):
            return False

    first_row = padded[0]
    rest_sample = padded[1:min(11, len(padded))]

    first_numeric_ratio = sum(looks_numeric(v) for v in first_row) / max(len(first_row), 1)
    rest_numeric_ratio = 0.0
    if rest_sample:
        total = sum(len(r) for r in rest_sample)
        numeric = sum(looks_numeric(v) for r in rest_sample for v in r)
        rest_numeric_ratio = numeric / max(total, 1)

    if first_numeric_ratio < 0.5 and rest_numeric_ratio >= 0.3:
        columns = [str(v) if v is not None else f'Column_{i+1}' for i, v in enumerate(first_row)]
        data_rows = padded[1:]
    else:
        columns = [f'Column_{i+1}' for i in range(max_cols)]
        data_rows = padded

    df = pd.DataFrame(data_rows, columns=columns)
    for col in df.columns:
        df[col] = pd.to_numeric(df[col], errors='ignore')
    return df

# ──────────────────────────────────────────────────────────
# Stats computation
# ──────────────────────────────────────────────────────────

def compute_stats(df: pd.DataFrame) -> dict:
    row_count = len(df)
    col_count = len(df.columns)
    is_large = row_count > LARGE_ROW_THRESHOLD

    # Missing values (full dataset)
    missing_values = df.isnull().sum()
    if len(missing_values) > MAX_COLS_REPORT:
        missing_values = missing_values.iloc[:MAX_COLS_REPORT]
    missing_dict = {k: int(v) for k, v in missing_values.items()}

    # Column types
    col_types = df.dtypes.astype(str).to_dict()
    if len(col_types) > MAX_COLS_REPORT:
        col_types = dict(list(col_types.items())[:MAX_COLS_REPORT])

    # Preview
    preview_frame = df.head(PREVIEW_ROWS)
    # Safely handle mixed types in preview
    preview_records = []
    for _, row in preview_frame.iterrows():
        preview_records.append({col: _to_python(val) for col, val in row.items()})

    # Numeric describe (sampled for large frames)
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    numeric_stats = {}
    if numeric_cols:
        subset_cols = numeric_cols[:min(50, len(numeric_cols))]  # cap columns
        if is_large:
            sample_df = df[subset_cols].sample(n=min(SAMPLE_SIZE, row_count), random_state=42)
        else:
            sample_df = df[subset_cols]
        try:
            desc = sample_df.describe()
            numeric_stats = safe_serialize(desc.to_dict())
        except Exception as e:
            log_info(f"Numeric stats failed: {e}")

    # Duplicate count (on sample for large datasets to avoid long scan)
    if is_large:
        sample_for_dup = df.sample(n=min(SAMPLE_SIZE, row_count), random_state=0)
        dup_count = int(sample_for_dup.duplicated().sum())
        dup_note = f"(estimated from {min(SAMPLE_SIZE, row_count):,}-row sample)"
    else:
        dup_count = int(df.duplicated().sum())
        dup_note = ""

    return {
        "rowCount": row_count,
        "columnCount": col_count,
        "missingValues": missing_dict,
        "columnTypes": col_types,
        "preview": preview_records,
        "numericStats": numeric_stats,
        "duplicateCount": dup_count,
        "duplicateNote": dup_note,
        "isSampled": is_large,
        "sampleSize": min(SAMPLE_SIZE, row_count) if is_large else row_count,
    }

# ──────────────────────────────────────────────────────────
# Cleaning (in-place to avoid memory duplication)
# ──────────────────────────────────────────────────────────

def clean_dataframe(df: pd.DataFrame) -> tuple:
    """Clean df in-place and return (df, duplicates_removed)."""
    rows_before = len(df)

    for col in df.columns:
        if pd.api.types.is_numeric_dtype(df[col]):
            col_mean = df[col].mean()
            if pd.isna(col_mean):
                df[col] = df[col].fillna(0)
            else:
                df[col] = df[col].fillna(col_mean)
        else:
            df[col] = df[col].fillna("Unknown")

    df.drop_duplicates(inplace=True)
    df.reset_index(drop=True, inplace=True)
    duplicates_removed = rows_before - len(df)
    return df, duplicates_removed

# ──────────────────────────────────────────────────────────
# Saving (chunked for large frames)
# ──────────────────────────────────────────────────────────

def save_processed(df: pd.DataFrame, output_dir: str, original_filename: str) -> str:
    base = os.path.splitext(original_filename)[0]
    processed_path = os.path.join(output_dir, f"processed_{base}.csv")
    row_count = len(df)

    log_info(f"Writing processed CSV ({row_count:,} rows) to {processed_path}")

    if row_count > LARGE_ROW_THRESHOLD:
        first = True
        for start in range(0, row_count, CHUNK_SIZE):
            chunk = df.iloc[start:start + CHUNK_SIZE]
            chunk.to_csv(
                processed_path,
                mode='w' if first else 'a',
                header=first,
                index=False
            )
            first = False
            del chunk
    else:
        df.to_csv(processed_path, index=False)

    log_info(f"Save complete: {os.path.getsize(processed_path)/1024/1024:.1f} MB")
    return processed_path

# ──────────────────────────────────────────────────────────
# Main entry point
# ──────────────────────────────────────────────────────────

def process_file(file_path: str, output_dir: str):
    t_start = time.time()

    try:
        filename = os.path.basename(file_path)
        ext = os.path.splitext(filename)[1].lower()

        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        file_size = os.path.getsize(file_path)
        if file_size == 0:
            raise ValueError("Uploaded file is empty (0 bytes).")

        log_progress(5, "Validating file")
        log_info(f"Processing: {filename} ({file_size/1024/1024:.1f} MB, ext={ext})")

        # ── Load ──────────────────────────────────────────
        log_progress(10, "Reading file")

        if ext == '.csv':
            df = read_csv_safe(file_path)
        elif ext in ['.xls', '.xlsx']:
            df = read_excel_safe(file_path)
        elif ext == '.json':
            df = read_json_safe(file_path)
        elif ext == '.txt':
            df = read_txt_safe(file_path)
        elif ext == '.data':
            df = parse_data_file(file_path)
        else:
            # For binary/image files return minimal result without error
            elapsed = round(time.time() - t_start, 2)
            result = {
                "rowCount": 0,
                "columnCount": 0,
                "missingValues": {},
                "columnTypes": {},
                "preview": [],
                "numericStats": {},
                "duplicateCount": 0,
                "duplicateNote": "",
                "isSampled": False,
                "sampleSize": 0,
                "processingTime": elapsed,
                "message": f"Preview not supported for '{ext}' files.",
            }
            print(json.dumps(result))
            return

        if df is None or len(df) == 0:
            raise ValueError("File parsed successfully but contains no data rows.")

        log_info(f"Loaded: {len(df):,} rows × {len(df.columns)} cols")
        log_progress(30, "Computing statistics")

        # ── Stats (before cleaning) ───────────────────────
        stats = compute_stats(df)
        gc.collect()

        log_progress(55, "Cleaning data")

        # ── Clean ─────────────────────────────────────────
        df, dups_removed = clean_dataframe(df)
        stats["duplicatesRemoved"] = dups_removed
        gc.collect()

        log_progress(75, "Saving cleaned file")

        # ── Save ──────────────────────────────────────────
        processed_path = save_processed(df, output_dir, filename)
        del df
        gc.collect()

        log_progress(95, "Finalising")

        elapsed = round(time.time() - t_start, 2)
        stats["processingTime"] = elapsed
        stats["processedPath"] = processed_path

        log_info(f"Done in {elapsed}s")
        log_progress(100, "Completed")

        # Output ONLY the JSON result on stdout (single line)
        sys.stdout.write(json.dumps(stats) + "\n")
        sys.stdout.flush()

    except Exception as exc:
        elapsed = round(time.time() - t_start, 2)
        tb = traceback.format_exc()
        log_info(f"FAILED after {elapsed}s: {exc}")
        error_payload = {
            "error": str(exc),
            "traceback": tb,
            "processingTime": elapsed,
        }
        sys.stdout.write(json.dumps(error_payload) + "\n")
        sys.stdout.flush()
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.stdout.write(json.dumps({"error": "Usage: python process.py <file_path> <output_dir>"}))
        sys.exit(1)

    process_file(sys.argv[1], sys.argv[2])
