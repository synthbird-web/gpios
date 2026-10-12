const http = require('http');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

// Accent/diacritic-insensitive normalisation used by species search and imports
function stripAccents(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const SUPPORTED_LANGS = ['en', 'es'];
const MAX_BODY_BYTES = 20 * 1024 * 1024; // 20 MB, generous for JSON backups

// Weather codes stored in the database (language-neutral)
const WEATHER_LABELS = {
  en: { sunny: 'Sunny', cloudy: 'Cloudy', fog: 'Fog', rain: 'Rain', wind: 'Wind', haze: 'Haze', storm: 'Storm', hail: 'Hail', snow: 'Snow' },
  es: { sunny: 'Soleado', cloudy: 'Nublado', fog: 'Niebla', rain: 'Lluvia', wind: 'Viento', haze: 'Calima', storm: 'Tormenta', hail: 'Granizo', snow: 'Nieve' }
};

// Values saved by previous versions (Spanish free text) -> codes
const LEGACY_WEATHER = {
  Soleado: 'sunny', Nublado: 'cloudy', Lluvia: 'rain', Viento: 'wind',
  Calima: 'haze', Tormenta: 'storm', Granizo: 'hail'
};

const CSV_HEADERS = {
  en: ['Session', 'Date', 'Time', 'Location', 'Latitude', 'Longitude', 'Weather',
    'Common name', 'Scientific name', 'Family', 'Count', 'Observation notes'],
  es: ['Jornada', 'Fecha', 'Hora', 'Ubicación', 'Latitud', 'Longitud', 'Meteorología',
    'Nombre común', 'Nombre científico', 'Familia', 'Cantidad', 'Notas de observación']
};

class HttpError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function registerFunctions(database) {
  if (!database) return;
  try {
    database.create_function('strip_accents', (text) => stripAccents(text));
  } catch (e) {
    // Already registered or non-critical
  }
}

// Idempotent schema migrations for databases created by older versions
function migrate(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  const stmt = db.prepare('UPDATE field_sessions SET habitat_notes = :code WHERE habitat_notes = :legacy;');
  for (const [legacy, code] of Object.entries(LEGACY_WEATHER)) {
    stmt.run({ ':code': code, ':legacy': legacy });
  }
  stmt.free();
}

async function initDatabase(dbPath) {
  let wasmPath = path.join(__dirname, 'sql-wasm.wasm');
  if (!fs.existsSync(wasmPath)) {
    wasmPath = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  }

  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(wasmPath) });

  if (!fs.existsSync(dbPath)) {
    const legacyPath = path.join(path.dirname(dbPath), 'cuaderno.db');
    if (fs.existsSync(legacyPath)) {
      try {
        fs.copyFileSync(legacyPath, dbPath);
        console.log(`[DB] Migrated legacy database '${legacyPath}' to '${dbPath}'`);
      } catch (e) {
        console.warn('[DB] Failed to copy legacy database, using legacy file directly:', e);
        dbPath = legacyPath;
      }
    } else {
      throw new Error(`Database not found at: ${dbPath}`);
    }
  }

  const db = new SQL.Database(fs.readFileSync(dbPath));
  registerFunctions(db);
  migrate(db);
  console.log(`[DB] Connected to SQLite via WebAssembly (sql.js): ${dbPath}`);
  return db;
}

function createServer(options = {}) {
  const baseDir = options.baseDir || path.join(__dirname, '..');
  const defaultDbPath = fs.existsSync(path.join(baseDir, 'gpios.db'))
    ? path.join(baseDir, 'gpios.db')
    : (fs.existsSync(path.join(baseDir, 'cuaderno.db')) ? path.join(baseDir, 'cuaderno.db') : path.join(baseDir, 'gpios.db'));
  const dbPath = options.dbPath || defaultDbPath;
  const staticDir = path.join(baseDir, 'static');
  const templatesDir = path.join(baseDir, 'templates');

  let db = null;
  let speciesIndex = [];

  // Atomic write: a crash mid-write can never leave a truncated database
  const saveToDisk = () => {
    if (!db) return;
    try {
      const data = db.export();
      // db.export() drops custom functions in sql.js, so re-register them
      registerFunctions(db);
      const tmpPath = `${dbPath}.tmp`;
      fs.writeFileSync(tmpPath, Buffer.from(data));
      fs.renameSync(tmpPath, dbPath);
    } catch (e) {
      console.error('[DB] Error writing to disk:', e);
    }
  };

  const queryAll = (sql, params = {}) => {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
  };

  const queryGet = (sql, params = {}) => queryAll(sql, params)[0] || null;

  const runExec = (sql, params = {}) => {
    const stmt = db.prepare(sql);
    stmt.run(params);
    stmt.free();
  };

  const getLastInsertId = () => {
    const res = db.exec('SELECT last_insert_rowid() AS id;');
    return res?.[0]?.values?.[0]?.[0] ?? null;
  };

  // Runs several writes atomically and persists once
  const transaction = (fn) => {
    db.run('BEGIN;');
    try {
      const result = fn();
      db.run('COMMIT;');
      saveToDisk();
      return result;
    } catch (err) {
      db.run('ROLLBACK;');
      throw err;
    }
  };

  // The species catalogue is read-only: keep a normalised in-memory index
  // instead of running a JS function over 4 columns x 11k rows on every keystroke.
  const buildSpeciesIndex = () => {
    speciesIndex = queryAll('SELECT id, scientific_name, common_name_es, common_name_en, family FROM species ORDER BY id;')
      .map(sp => ({
        sp,
        key: stripAccents([sp.common_name_en, sp.common_name_es, sp.scientific_name, sp.family].join('\u0001'))
      }));
  };

  const searchSpecies = (q, limit = 15) => {
    const target = stripAccents(q);
    const out = [];
    for (const entry of speciesIndex) {
      if (entry.key.includes(target)) {
        out.push(entry.sp);
        if (out.length >= limit) break;
      }
    }
    return out;
  };

  const getSettings = () => {
    const rows = queryAll('SELECT key, value FROM app_settings;');
    const raw = Object.fromEntries(rows.map(r => [r.key, r.value]));
    let location = null;
    try { location = raw.location ? JSON.parse(raw.location) : null; } catch { location = null; }
    return {
      user_name: raw.user_name || '',
      language: SUPPORTED_LANGS.includes(raw.language) ? raw.language : null,
      location,
      onboarded: raw.onboarded === '1'
    };
  };

  const insertObservations = (sessionId, observations) => {
    if (!Array.isArray(observations)) return;
    for (const obs of observations) {
      const speciesId = parseInt(obs.species_id, 10);
      if (!Number.isInteger(speciesId)) continue;
      runExec(`
        INSERT INTO session_observations (session_id, species_id, individual_count, observation_notes)
        VALUES (:sid, :spid, :count, :notes);
      `, {
        ':sid': sessionId,
        ':spid': speciesId,
        ':count': Math.max(1, parseInt(obs.individual_count, 10) || 1),
        ':notes': obs.observation_notes || ''
      });
    }
  };

  const validateSession = (data) => {
    const lat = parseFloat(data.approx_lat);
    const lng = parseFloat(data.approx_lng);
    if (!String(data.title || '').trim()) throw new HttpError('Missing title');
    if (!data.session_date) throw new HttpError('Missing date');
    if (!String(data.location_name || '').trim()) throw new HttpError('Missing location');
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new HttpError('Invalid coordinates');
    }
    return {
      ':title': String(data.title).trim(),
      ':date': data.session_date,
      ':time': data.start_time || '',
      ':loc': String(data.location_name).trim(),
      ':lat': lat,
      ':lng': lng,
      ':hab': data.habitat_notes || ''
    };
  };

  const timestamp = () => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  };

  const server = http.createServer(async (req, res) => {
    // No CORS headers on purpose: only the app itself (same origin) may call this API.
    const parsedUrl = new URL(req.url, 'http://127.0.0.1');
    const pathname = parsedUrl.pathname;
    const query = Object.fromEntries(parsedUrl.searchParams.entries());
    const sessionIdMatch = pathname.match(/^\/api\/sessions\/(\d+)$/);
    const sessionId = sessionIdMatch ? parseInt(sessionIdMatch[1], 10) : null;

    const sendJson = (data, statusCode = 200, extraHeaders = {}) => {
      res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders });
      res.end(JSON.stringify(data));
    };

    const sendFile = (filePath, contentType) => {
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
    };

    const readJsonBody = () => new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          reject(new HttpError('Request body too large', 413));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'));
        } catch {
          reject(new HttpError('Invalid JSON body'));
        }
      });
      req.on('error', reject);
    });

    try {
      // --- Static content ---
      if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
        return sendFile(path.join(templatesDir, 'index.html'), MIME_TYPES['.html']);
      }

      if (req.method === 'GET' && pathname === '/favicon.ico') {
        return sendFile(path.join(staticDir, 'icon.ico'), MIME_TYPES['.ico']);
      }

      if (req.method === 'GET' && pathname.startsWith('/static/')) {
        const safePath = path.normalize(path.join(staticDir, decodeURIComponent(pathname.slice('/static/'.length))));
        if (safePath.startsWith(staticDir + path.sep) && fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
          const contentType = MIME_TYPES[path.extname(safePath).toLowerCase()] || 'application/octet-stream';
          return sendFile(safePath, contentType);
        }
        throw new HttpError('File not found', 404);
      }

      // --- API: settings ---
      if (pathname === '/api/settings') {
        if (req.method === 'GET') return sendJson(getSettings());

        if (req.method === 'PUT') {
          const data = await readJsonBody();
          if (!data || typeof data !== 'object') throw new HttpError('Invalid settings');
          const updates = {};
          if (typeof data.user_name === 'string') updates.user_name = data.user_name.trim().slice(0, 80);
          if (SUPPORTED_LANGS.includes(data.language)) updates.language = data.language;
          if (data.location && Number.isFinite(data.location.lat) && Number.isFinite(data.location.lng)) {
            updates.location = JSON.stringify({
              lat: data.location.lat,
              lng: data.location.lng,
              label: String(data.location.label || '').slice(0, 200),
              bbox: Array.isArray(data.location.bbox) && data.location.bbox.length === 4 ? data.location.bbox.map(Number) : null,
              source: data.location.source || 'manual'
            });
          }
          if (data.onboarded) updates.onboarded = '1';

          transaction(() => {
            for (const [key, value] of Object.entries(updates)) {
              runExec('INSERT OR REPLACE INTO app_settings (key, value) VALUES (:k, :v);', { ':k': key, ':v': value });
            }
          });
          return sendJson(getSettings());
        }
      }

      // --- API: species search ---
      if (req.method === 'GET' && pathname === '/api/species/search') {
        const q = (query.q || '').trim();
        return sendJson(q.length < 2 ? [] : searchSpecies(q));
      }

      // --- API: sessions ---
      if (req.method === 'GET' && pathname === '/api/sessions') {
        return sendJson(queryAll(`
          SELECT s.id, s.title, s.session_date, s.start_time, s.location_name,
                 s.approx_lat, s.approx_lng, s.habitat_notes,
                 COUNT(DISTINCT obs.species_id) AS total_species,
                 COALESCE(SUM(obs.individual_count), 0) AS total_individuals
          FROM field_sessions s
          LEFT JOIN session_observations obs ON s.id = obs.session_id
          GROUP BY s.id
          ORDER BY s.session_date DESC, s.id DESC;
        `));
      }

      if (req.method === 'GET' && sessionId !== null) {
        const session = queryGet('SELECT * FROM field_sessions WHERE id = :id;', { ':id': sessionId });
        if (!session) throw new HttpError('Session not found', 404);
        session.observations = queryAll(`
          SELECT obs.id, obs.individual_count, obs.observation_notes,
                 sp.id AS species_id, sp.scientific_name, sp.common_name_es, sp.common_name_en, sp.family
          FROM session_observations obs
          JOIN species sp ON obs.species_id = sp.id
          WHERE obs.session_id = :id;
        `, { ':id': sessionId });
        return sendJson(session);
      }

      if (req.method === 'POST' && pathname === '/api/sessions') {
        const data = await readJsonBody();
        const params = validateSession(data || {});
        const newId = transaction(() => {
          runExec(`
            INSERT INTO field_sessions (title, session_date, start_time, location_name, approx_lat, approx_lng, habitat_notes)
            VALUES (:title, :date, :time, :loc, :lat, :lng, :hab);
          `, params);
          const id = getLastInsertId();
          insertObservations(id, data.observations);
          return id;
        });
        return sendJson({ status: 'success', session_id: newId });
      }

      if (req.method === 'PUT' && sessionId !== null) {
        const data = await readJsonBody();
        const params = validateSession(data || {});
        if (!queryGet('SELECT id FROM field_sessions WHERE id = :id;', { ':id': sessionId })) {
          throw new HttpError('Session not found', 404);
        }
        transaction(() => {
          runExec(`
            UPDATE field_sessions
            SET title = :title, session_date = :date, start_time = :time, location_name = :loc,
                approx_lat = :lat, approx_lng = :lng, habitat_notes = :hab
            WHERE id = :id;
          `, { ...params, ':id': sessionId });
          runExec('DELETE FROM session_observations WHERE session_id = :id;', { ':id': sessionId });
          insertObservations(sessionId, data.observations);
        });
        return sendJson({ status: 'success', session_id: sessionId });
      }

      if (req.method === 'DELETE' && sessionId !== null) {
        transaction(() => {
          runExec('DELETE FROM session_observations WHERE session_id = :id;', { ':id': sessionId });
          runExec('DELETE FROM field_sessions WHERE id = :id;', { ':id': sessionId });
        });
        return sendJson({ status: 'success', deleted_id: sessionId });
      }

      // --- API: export CSV (?lang=en|es) ---
      if (req.method === 'GET' && pathname === '/api/backup/export-csv') {
        const lang = SUPPORTED_LANGS.includes(query.lang) ? query.lang : 'en';
        const rows = queryAll(`
          SELECT s.title, s.session_date, COALESCE(s.start_time, '') AS start_time, s.location_name,
                 s.approx_lat, s.approx_lng, COALESCE(s.habitat_notes, '') AS habitat_notes,
                 sp.common_name_es, sp.common_name_en, sp.scientific_name, sp.family,
                 obs.individual_count, COALESCE(obs.observation_notes, '') AS observation_notes
          FROM field_sessions s
          JOIN session_observations obs ON s.id = obs.session_id
          JOIN species sp ON obs.species_id = sp.id
          ORDER BY s.session_date DESC, s.id DESC;
        `);

        const escapeCsv = (val) => {
          if (val === null || val === undefined) return '';
          const str = String(val);
          return /[;"\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
        };

        const lines = [CSV_HEADERS[lang].join(';')];
        for (const r of rows) {
          lines.push([
            r.title, r.session_date, r.start_time, r.location_name,
            r.approx_lat, r.approx_lng,
            WEATHER_LABELS[lang][r.habitat_notes] || r.habitat_notes,
            lang === 'es' ? r.common_name_es : r.common_name_en,
            r.scientific_name, r.family, r.individual_count, r.observation_notes
          ].map(escapeCsv).join(';'));
        }

        // UTF-8 BOM so Microsoft Excel detects the encoding
        const csvBuffer = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(lines.join('\r\n') + '\r\n', 'utf8')]);
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="gpios_${timestamp()}.csv"`,
          'Content-Length': csvBuffer.length
        });
        return res.end(csvBuffer);
      }

      // --- API: export JSON backup ---
      if (req.method === 'GET' && pathname === '/api/backup/export-json') {
        const sessions = queryAll('SELECT * FROM field_sessions ORDER BY session_date ASC, id ASC;');
        for (const s of sessions) {
          s.observations = queryAll(`
            SELECT obs.individual_count, obs.observation_notes,
                   sp.scientific_name, sp.common_name_es, sp.common_name_en
            FROM session_observations obs
            JOIN species sp ON obs.species_id = sp.id
            WHERE obs.session_id = :id;
          `, { ':id': s.id });
        }
        return sendJson(sessions, 200, {
          'Content-Disposition': `attachment; filename="gpios_backup_${timestamp()}.json"`
        });
      }

      // --- API: import JSON backup ---
      if (req.method === 'POST' && pathname === '/api/backup/import-json') {
        let sessions = await readJsonBody();
        if (!sessions || typeof sessions !== 'object') throw new HttpError('Invalid JSON format');
        if (!Array.isArray(sessions)) sessions = [sessions];

        const findSpecies = (obs) => {
          const sci = String(obs.scientific_name || '').trim();
          if (sci) {
            const sp = queryGet('SELECT id FROM species WHERE scientific_name = :v LIMIT 1;', { ':v': sci });
            if (sp) return sp.id;
          }
          for (const name of [obs.common_name_es, obs.common_name_en]) {
            const target = stripAccents(String(name || '').trim());
            if (!target) continue;
            const hit = speciesIndex.find(e => stripAccents(e.sp.common_name_es) === target || stripAccents(e.sp.common_name_en) === target);
            if (hit) return hit.sp.id;
          }
          return null;
        };

        const today = new Date().toISOString().slice(0, 10);
        const result = transaction(() => {
          let imported = 0;
          let skipped = 0;
          for (const s of sessions) {
            const lat = parseFloat(s.approx_lat);
            const lng = parseFloat(s.approx_lng);
            // A field session without valid coordinates cannot be placed on the map
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) { skipped++; continue; }

            runExec(`
              INSERT INTO field_sessions (title, session_date, start_time, location_name, approx_lat, approx_lng, habitat_notes)
              VALUES (:title, :date, :time, :loc, :lat, :lng, :hab);
            `, {
              ':title': s.title || 'Imported session',
              ':date': s.session_date || today,
              ':time': s.start_time || '',
              ':loc': s.location_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
              ':lat': lat,
              ':lng': lng,
              ':hab': LEGACY_WEATHER[s.habitat_notes] || s.habitat_notes || ''
            });
            const newId = getLastInsertId();
            const observations = (Array.isArray(s.observations) ? s.observations : [])
              .map(obs => ({ ...obs, species_id: findSpecies(obs) }))
              .filter(obs => obs.species_id);
            insertObservations(newId, observations);
            imported++;
          }
          return { imported, skipped };
        });

        return sendJson({ status: 'success', imported_sessions: result.imported, skipped_sessions: result.skipped });
      }

      throw new HttpError('Route not found', 404);
    } catch (err) {
      const statusCode = err.statusCode || 500;
      if (statusCode >= 500) console.error('[Server Error]', err);
      if (!res.headersSent) sendJson({ status: 'error', error: err.message }, statusCode);
    }
  });

  return {
    start: async (port = 0, host = '127.0.0.1') => {
      db = await initDatabase(dbPath);
      buildSpeciesIndex();
      saveToDisk(); // persist migrations

      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          const activePort = server.address().port;
          const serverUrl = `http://${host}:${activePort}`;
          console.log(`[GPIOS server] Listening on ${serverUrl}`);
          resolve({ port: activePort, url: serverUrl, server });
        });
      });
    },
    stop: () => {
      if (db) saveToDisk();
      return new Promise(resolve => server.close(() => resolve()));
    },
    getDb: () => db
  };
}

module.exports = { createServer, stripAccents };
