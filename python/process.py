import sys
import pandas as pd
import numpy as np
import json
import os

def parse_data_file(file_path):
    """
    Robustly parse a .data file by:
    1. Auto-detecting encoding
    2. Auto-detecting delimiter (comma, semicolon, tab, pipe, space)
    3. Detecting whether a header row is present
    4. Auto-generating column names (Column_1, Column_2, ...) if no header
    5. Handling inconsistent row lengths by padding with NaN
    """
    import io

    # --- Detect encoding ---
    encodings_to_try = ['utf-8', 'latin-1', 'iso-8859-1', 'cp1252']
    raw_text = None
    for enc in encodings_to_try:
        try:
            with open(file_path, 'r', encoding=enc) as f:
                raw_text = f.read()
            break
        except (UnicodeDecodeError, LookupError):
            continue

    if raw_text is None:
        raise ValueError("Unable to decode .data file with supported encodings (utf-8, latin-1, iso-8859-1, cp1252).")

    raw_text = raw_text.strip()
    if not raw_text:
        raise ValueError("The .data file is empty.")

    lines = [l for l in raw_text.splitlines() if l.strip()]
    if not lines:
        raise ValueError("The .data file contains no data rows.")

    # --- Detect delimiter ---
    candidate_delimiters = [',', ';', '\t', '|', ' ']
    delimiter = ','  # default

    first_line = lines[0]
    best_count = 0
    for delim in candidate_delimiters:
        count = first_line.count(delim)
        if count > best_count:
            best_count = count
            delimiter = delim

    # If space-delimited, collapse multiple spaces
    if delimiter == ' ':
        lines = [' '.join(l.split()) for l in lines]

    # --- Determine if first row is a header ---
    # Rule: first row is a header only if EVERY token is non-numeric (pure string label).
    # If any token in the first row parses as a number, the file has no header row.
    def _is_numeric_token(tok):
        try:
            float(tok)
            return True
        except (ValueError, TypeError):
            return False

    first_tokens = [t.strip() for t in (lines[0].split() if delimiter == ' ' else lines[0].split(delimiter))]
    first_row_has_numbers = any(_is_numeric_token(t) for t in first_tokens)
    infer_header = None if first_row_has_numbers else 'infer'

    # --- Try pandas for a cleaner parse ---
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
            # If pandas used header='infer' but column names still look unnamed, rename
            cols = df.columns.tolist()
            if all(str(c).startswith('Unnamed') for c in cols):
                df.columns = [f'Column_{i+1}' for i in range(len(df.columns))]
        return df
    except Exception:
        pass

    # --- Manual fallback: parse line-by-line, pad uneven rows ---
    parsed_rows = []
    for line in lines:
        if delimiter == ' ':
            row = line.split()
        else:
            row = line.split(delimiter)
        parsed_rows.append(row)

    if not parsed_rows:
        raise ValueError("Failed to parse any rows from the .data file.")

    max_cols = max(len(r) for r in parsed_rows)

    # Pad shorter rows with None
    padded = [r + [None] * (max_cols - len(r)) for r in parsed_rows]

    # Heuristic: if first row has all string/non-numeric values and other rows have numerics, treat as header
    def looks_numeric(val):
        if val is None:
            return False
        try:
            float(val)
            return True
        except (ValueError, TypeError):
            return False

    first_row = padded[0]
    rest_rows = padded[1:] if len(padded) > 1 else []

    first_row_numeric_ratio = sum(looks_numeric(v) for v in first_row) / max(len(first_row), 1)
    rest_numeric_ratio = 0.0
    if rest_rows:
        sample = rest_rows[:min(10, len(rest_rows))]
        total_cells = sum(len(r) for r in sample)
        numeric_cells = sum(looks_numeric(v) for r in sample for v in r)
        rest_numeric_ratio = numeric_cells / max(total_cells, 1)

    if first_row_numeric_ratio < 0.5 and rest_numeric_ratio >= 0.3:
        # First row is likely a header
        columns = [str(v) if v is not None else f'Column_{i+1}' for i, v in enumerate(first_row)]
        data_rows = padded[1:]
    else:
        columns = [f'Column_{i+1}' for i in range(max_cols)]
        data_rows = padded

    df = pd.DataFrame(data_rows, columns=columns)

    # Attempt numeric coercion per column
    for col in df.columns:
        df[col] = pd.to_numeric(df[col], errors='ignore')

    return df


def process_file(file_path, output_dir):
    try:
        # Determine file type and load
        filename = os.path.basename(file_path)
        ext = os.path.splitext(filename)[1].lower()
        
        df = None
        
        if ext == '.csv':
            df = pd.read_csv(file_path)
        elif ext in ['.xls', '.xlsx']:
            df = pd.read_excel(file_path)
        elif ext == '.json':
            df = pd.read_json(file_path)
        elif ext == '.txt':
            # Try CSV with minimal config, or just read lines
            try:
                df = pd.read_csv(file_path, sep=None, engine='python')
            except:
                with open(file_path, 'r') as f:
                    content = f.read()
                df = pd.DataFrame({'content': [content]})
        elif ext == '.data':
            df = parse_data_file(file_path)
        else:
             # Fallback for unsupported textual/image files just to return something
             return {
                 "rowCount": 0,
                 "columnCount": 0,
                 "missingValues": {},
                 "columnTypes": {},
                 "preview": [],
                 "message": "Preview not supported for this file type yet"
             }

        # Stats
        row_count = len(df)
        col_count = len(df.columns)
        missing_values = df.isnull().sum().to_dict()
        column_types = df.dtypes.astype(str).to_dict()
        
        # Safe preview (handle NaNs and non-serializable types)
        preview_df = df.head(5).replace({np.nan: None})
        preview = preview_df.to_dict(orient='records')

        # Cleaning: Fill missing numeric with mean, text with "Unknown"
        # Simple heuristic for "Auto Clean"
        df_cleaned = df.copy()
        for col in df_cleaned.columns:
            if pd.api.types.is_numeric_dtype(df_cleaned[col]):
                df_cleaned[col] = df_cleaned[col].fillna(df_cleaned[col].mean())
            else:
                df_cleaned[col] = df_cleaned[col].fillna("Unknown")
        
        df_cleaned = df_cleaned.drop_duplicates()
        
        # Save processed file
        processed_filename = f"processed_{filename}"
        # Force .csv extension for processed output for consistency in download
        processed_filename_csv = os.path.splitext(processed_filename)[0] + ".csv"
        processed_path = os.path.join(output_dir, processed_filename_csv)
        
        # Save as CSV for simple universal download
        df_cleaned.to_csv(processed_path, index=False)

        result = {
            "rowCount": row_count,
            "columnCount": col_count,
            "missingValues": missing_values,
            "columnTypes": column_types,
            "preview": preview,
            "processedPath": processed_path
        }
        
        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python process.py <file_path> <output_dir>"}))
        sys.exit(1)
        
    process_file(sys.argv[1], sys.argv[2])
