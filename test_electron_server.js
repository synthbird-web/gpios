// Integration test for the embedded server. Runs against a temporary copy of
// gpios.db so the real database is never modified.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { createServer } = require('./electron/server');

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gpios-test-'));
  const dbPath = path.join(tmpDir, 'gpios.db');
  const sourceDb = fs.existsSync(path.join(__dirname, 'gpios.db'))
    ? path.join(__dirname, 'gpios.db')
    : path.join(__dirname, 'cuaderno.db');
  fs.copyFileSync(sourceDb, dbPath);

  const appServer = createServer({ dbPath });
  const { url } = await appServer.start(0);
  const call = async (method, route, body) => {
    const res = await fetch(url + route, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text, headers: res.headers };
  };

  const check = (name, fn) => fn().then(() => console.log(`  ✓ ${name}`));
  let failed = false;

  try {
    console.log(`GPIOS server test (${url})`);

    await check('home page is served', async () => {
      const r = await call('GET', '/');
      assert.strictEqual(r.status, 200);
      assert.ok(r.text.includes('GPIOS'));
    });

    await check('path traversal is blocked', async () => {
      const r = await call('GET', '/static/..%2Fpackage.json');
      assert.strictEqual(r.status, 404);
    });

    await check('species search: Spanish with accents', async () => {
      const r = await call('GET', `/api/species/search?q=${encodeURIComponent('águila real')}`);
      assert.ok(r.json.some(s => s.scientific_name === 'Aquila chrysaetos'));
    });

    await check('species search: English and accent-insensitive', async () => {
      const en = await call('GET', '/api/species/search?q=golden%20eagle');
      assert.ok(en.json.some(s => s.scientific_name === 'Aquila chrysaetos'));
      const noAccent = await call('GET', '/api/species/search?q=aguila%20real');
      assert.ok(noAccent.json.some(s => s.scientific_name === 'Aquila chrysaetos'));
    });

    await check('settings: defaults then update', async () => {
      const before = await call('GET', '/api/settings');
      assert.strictEqual(before.json.onboarded, false);
      const after = await call('PUT', '/api/settings', {
        user_name: 'Test', language: 'es', onboarded: true,
        location: { lat: 38.09, lng: -3.63, label: 'Jaén, España', bbox: [37.37, 38.53, -4.28, -2.43], source: 'manual' }
      });
      assert.strictEqual(after.json.user_name, 'Test');
      assert.strictEqual(after.json.language, 'es');
      assert.strictEqual(after.json.onboarded, true);
      assert.deepStrictEqual(after.json.location.bbox, [37.37, 38.53, -4.28, -2.43]);
    });

    const eagle = (await call('GET', '/api/species/search?q=Aquila%20chrysaetos')).json[0];
    let sessionId = null;

    await check('sessions: create, read, update', async () => {
      const created = await call('POST', '/api/sessions', {
        title: 'Test session', session_date: '2026-10-12', start_time: '08:30',
        location_name: 'Linares', approx_lat: 38.09, approx_lng: -3.63, habitat_notes: 'sunny',
        observations: [{ species_id: eagle.id, individual_count: 2, observation_notes: 'pair' }]
      });
      assert.strictEqual(created.status, 200);
      sessionId = created.json.session_id;

      const detail = await call('GET', `/api/sessions/${sessionId}`);
      assert.strictEqual(detail.json.observations.length, 1);
      assert.strictEqual(detail.json.observations[0].common_name_en, 'Golden Eagle');

      const updated = await call('PUT', `/api/sessions/${sessionId}`, {
        ...detail.json, title: 'Edited session', habitat_notes: 'rain',
        observations: [{ species_id: eagle.id, individual_count: 3 }]
      });
      assert.strictEqual(updated.status, 200);
      const detail2 = await call('GET', `/api/sessions/${sessionId}`);
      assert.strictEqual(detail2.json.title, 'Edited session');
      assert.strictEqual(detail2.json.observations[0].individual_count, 3);
    });

    await check('sessions: validation and missing ids', async () => {
      assert.strictEqual((await call('POST', '/api/sessions', '{bad json')).status, 400);
      assert.strictEqual((await call('POST', '/api/sessions', { title: 'x' })).status, 400);
      assert.strictEqual((await call('PUT', '/api/sessions/999999', {
        title: 'x', session_date: '2026-01-01', location_name: 'x', approx_lat: 1, approx_lng: 1
      })).status, 404);
      assert.strictEqual((await call('GET', '/api/sessions/999999')).status, 404);
    });

    await check('CSV export is localised', async () => {
      const es = await call('GET', '/api/backup/export-csv?lang=es');
      assert.ok(es.text.includes('Jornada;Fecha'));
      assert.ok(es.text.includes('Lluvia'));
      assert.ok(es.text.includes('Águila real'));
      const en = await call('GET', '/api/backup/export-csv?lang=en');
      assert.ok(en.text.includes('Session;Date'));
      assert.ok(en.text.includes('Golden Eagle'));
    });

    await check('JSON backup round-trip (incl. legacy weather values)', async () => {
      const backup = (await call('GET', '/api/backup/export-json')).json;
      backup.push({
        title: 'Legacy', session_date: '2025-01-01', location_name: 'Old', approx_lat: 36.7, approx_lng: -4.4,
        habitat_notes: 'Soleado', observations: [{ common_name_es: 'Aguila real', individual_count: 1 }]
      });
      backup.push({ title: 'No coords', observations: [] });
      const r = await call('POST', '/api/backup/import-json', backup);
      assert.strictEqual(r.json.imported_sessions, 2);
      assert.strictEqual(r.json.skipped_sessions, 1);
      const list = (await call('GET', '/api/sessions')).json;
      const legacy = list.find(s => s.title === 'Legacy');
      assert.strictEqual(legacy.habitat_notes, 'sunny');
      assert.strictEqual(legacy.total_species, 1);
    });

    await check('delete session', async () => {
      assert.strictEqual((await call('DELETE', `/api/sessions/${sessionId}`)).status, 200);
      assert.strictEqual((await call('GET', `/api/sessions/${sessionId}`)).status, 404);
    });

    await check('removed hotspot endpoint returns 404', async () => {
      assert.strictEqual((await call('POST', '/api/hotspots/update', {})).status, 404);
    });

    console.log('All tests passed.');
  } catch (err) {
    failed = true;
    console.error('  ✗ Test failed:', err);
  } finally {
    await appServer.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.exit(failed ? 1 : 0);
  }
}

main();
