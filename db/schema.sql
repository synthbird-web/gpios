-- 1. Taxonomic reference catalogue (Read-only)
CREATE TABLE IF NOT EXISTS species (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scientific_name TEXT UNIQUE NOT NULL,
    common_name_es TEXT NOT NULL,
    common_name_en TEXT,
    family TEXT,
    order_name TEXT
);

-- 2. Field outings / Sessions (Editable)
CREATE TABLE IF NOT EXISTS field_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    session_date DATE NOT NULL,
    start_time TIME,
    location_name TEXT NOT NULL,
    approx_lat REAL NOT NULL,
    approx_lng REAL NOT NULL,
    habitat_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Observations recorded in each session (Editable)
CREATE TABLE IF NOT EXISTS session_observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    species_id INTEGER NOT NULL,
    individual_count INTEGER DEFAULT 1 CHECK (individual_count > 0),
    observation_notes TEXT,
    FOREIGN KEY (session_id) REFERENCES field_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (species_id) REFERENCES species(id)
);

-- 4. Application settings and user preferences
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- Indices for fast searching
CREATE INDEX IF NOT EXISTS idx_species_es ON species(common_name_es);
CREATE INDEX IF NOT EXISTS idx_species_en ON species(common_name_en);
CREATE INDEX IF NOT EXISTS idx_species_sci ON species(scientific_name);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON field_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_obs_session ON session_observations(session_id);
