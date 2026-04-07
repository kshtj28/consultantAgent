import pandas as pd
import sys

def print_headers(file_path):
    try:
        df = pd.read_excel(file_path)
        print(f"Headers for {file_path}:")
        print(list(df.columns))
    except Exception as e:
        print(f"Error reading {file_path}: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        print_headers(sys.argv[1])
