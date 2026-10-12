import sqlite3
import pandas as pd
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "gpios.db"
SCHEMA_PATH = BASE_DIR / "db" / "schema.sql"
EXCEL_PATH = BASE_DIR / "data" / "ioc_aves.xlsx"

def load_species():
    if not EXCEL_PATH.exists():
        print(f"Error: Catalogue file not found at {EXCEL_PATH}")
        return

    print(f"1. Reading taxonomic catalogue from {EXCEL_PATH.name}...")
    df = pd.read_excel(EXCEL_PATH, sheet_name='List')

    # Select and rename columns
    df_clean = df[['IOC_15.2', 'Spanish', 'English', 'Family', 'Order']].copy()
    df_clean.columns = ['scientific_name', 'common_name_es', 'common_name_en', 'family', 'order_name']

    # Handle missing values
    df_clean = df_clean.dropna(subset=['scientific_name'])
    df_clean['common_name_es'] = df_clean['common_name_es'].fillna(df_clean['scientific_name'])
    df_clean['common_name_en'] = df_clean['common_name_en'].fillna(df_clean['scientific_name'])

    print("2. Initializing SQLite tables...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("PRAGMA foreign_keys = ON;")

    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        cursor.executescript(f.read())

    print("3. Inserting species records...")
    records = df_clean.to_records(index=False).tolist()
    cursor.executemany('''
        INSERT OR IGNORE INTO species (scientific_name, common_name_es, common_name_en, family, order_name)
        VALUES (?, ?, ?, ?, ?);
    ''', records)

    conn.commit()

    cursor.execute("SELECT COUNT(*) FROM species;")
    total = cursor.fetchone()[0]
    print(f"Success: {total} species loaded successfully into 'gpios.db'.")
    conn.close()

if __name__ == "__main__":
    load_species()
