import sys
import pandas as pd
import numpy as np
import json
import os

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
        processed_path = os.path.join(output_dir, processed_filename)
        
        # Save as CSV for simplicity for now
        if ext in ['.json']:
             df_cleaned.to_json(processed_path, orient='records')
        else:
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
