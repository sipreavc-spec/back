import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import authRouter from "./authRoutes.js";

dotenv.config();
const app = express();
app.use(cors());
// Allow larger JSON bodies for non-file endpoints (safe moderate limit)
app.use(express.json({ limit: '10mb' }));

// --------------------
// MySQL (Aiven) Pool
// --------------------
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  multipleStatements: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: { rejectUnauthorized: false },
});

// Export pool para usar em authRoutes
export { pool };

// Mount auth routes
app.use("/api/auth", authRouter);

// Flag para indicar se o banco está disponível. Se false, usamos fallback em memória.
let dbAvailable = true;

// Storage em memória como fallback para ambiente de desenvolvimento sem DB
const memStore = {
  _id: 1,
  vitals: [], // array de entradas gerais
  esp1: [],   // array de leituras ESP1
  esp2: [],   // array de leituras ESP2
};

const nowMs = () => Date.now();

function insertMem(table, entry) {
  const e = { id: memStore._id++, patientId: entry.patientId, ts: nowMs(), meta: entry.meta || {}, ...entry };
  if (table === 'vitals') memStore.vitals.unshift(e);
  else if (table === 'esp1') memStore.esp1.unshift(e);
  else if (table === 'esp2') memStore.esp2.unshift(e);
  return e;
}

function getLatestMem(table, pid) {
  const arr = table === 'esp1' ? memStore.esp1 : table === 'esp2' ? memStore.esp2 : memStore.vitals;
  const found = arr.find(item => item.patientId === pid);
  return found || null;
}

function getEntriesMem(pid, limit=100, offset=0, since) {
  let arr = memStore.vitals.filter(e => e.patientId === pid);
  if (since) arr = arr.filter(e => e.ts >= parseInt(since,10));
  return arr.slice(offset, offset + limit);
}

// Safe wrapper around pool.query that marks DB unavailable on error
async function safeQuery(sql, params=[]) {
  try {
    return await pool.query(sql, params);
  } catch (err) {
    console.error('DB query error:', err && err.code ? `${err.code} ${err.message}` : err.message || err);
    dbAvailable = false;
    console.warn('⚠️ Banco indisponível — alternando para fallback em memória.');
    return [null, err];
  }
}

// Corrigir __dirname (pois em ES Modules ele não existe direto)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initDatabase() {
  try {
    // Sobe uma pasta (de /src para /)
    const sqlPath = path.join(__dirname, "../init_db.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");

    console.log("🟢 Inicializando o banco de dados...");
    const [initRes, initErr] = await safeQuery(sql);
    if (!initRes) throw initErr || new Error('db init failed');
    console.log("✅ Banco de dados inicializado com sucesso!");
  } catch (err) {
    console.error("❌ Erro ao inicializar o banco de dados:", err.message);
    // Se falhar (ex: DNS ENOTFOUND em ambiente local), desativa uso do banco e usa fallback em memória
    dbAvailable = false;
    console.warn("⚠️ Banco indisponível — usando fallback em memória para desenvolvimento.");
  }
}

let lastRfidCode = null; // variável em memória que guarda o último código

// Endpoint que o ESP32 chama para enviar o código RFID
app.post('/rfid', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'code é obrigatório' });

  lastRfidCode = code;
  console.log('RFID recebido:', code);
  return res.json({ ok: true });
});

// Endpoint que o frontend chama para obter o último código
app.get('/rfid', (req, res) => {
  return res.json({ code: lastRfidCode });
});

// --------------------
// Endpoints para Vitals (ESP32)
// --------------------

// POST /api/vitals  -> insere uma leitura
app.post('/api/vitals', async (req, res) => {
  try {
    const body = req.body || {};
    const patientId = body.patientId || body.patient_id;
    if (!patientId) return res.status(400).json({ error: 'patientId is required' });

    const bpm = body.bpm != null ? parseInt(body.bpm, 10) : null;
    const spo2 = body.spo2 != null ? parseInt(body.spo2, 10) : null;
    const systolic = body.systolic != null ? parseInt(body.systolic, 10) : null;
    const diastolic = body.diastolic != null ? parseInt(body.diastolic, 10) : null;
    const temperature = body.temperature != null ? parseFloat(body.temperature) : null;

    // Store remaining fields in meta
    const metaObj = { ...body };
    delete metaObj.patientId; delete metaObj.patient_id; delete metaObj.bpm; delete metaObj.spo2; delete metaObj.systolic; delete metaObj.diastolic; delete metaObj.temperature;

    if (!dbAvailable) {
      const e = insertMem('vitals', { patientId, bpm, spo2, systolic, diastolic, temperature, meta: metaObj });
      return res.status(201).json({ ok: true, id: e.id });
    }

    const [result, qerr] = await safeQuery(
      `INSERT INTO vitals (patient_id, bpm, spo2, systolic, diastolic, temperature, meta) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [patientId, bpm, spo2, systolic, diastolic, temperature, JSON.stringify(metaObj)]
    );
    if (!result) {
      // DB failed during insert, fallback to memory
      const e = insertMem('vitals', { patientId, bpm, spo2, systolic, diastolic, temperature, meta: metaObj });
      return res.status(201).json({ ok: true, id: e.id });
    }

    return res.status(201).json({ ok: true, id: result.insertId });
  } catch (err) {
    return handleError(res, err);
  }
});

// GET /api/vitals  -> consulta histórico (query params: patientId, limit, offset, since)
app.get('/api/vitals', async (req, res) => {
  try {
    const { patientId, limit = '100', offset = '0', since } = req.query || {};
    const l = Math.min(10000, Math.max(1, parseInt(limit, 10) || 100));
    const o = Math.max(0, parseInt(offset, 10) || 0);

    const params = [];
    let where = '';
    if (patientId) {
      where += ' WHERE patient_id = ?';
      params.push(patientId);
    }

    if (since) {
      // assume since is milliseconds since epoch
      const sinceMs = parseInt(since, 10);
      if (!isNaN(sinceMs)) {
        where += where ? ' AND ' : ' WHERE ';
        where += ' ts >= FROM_UNIXTIME(?/1000)';
        params.push(sinceMs);
      }
    }

    params.push(l);
    params.push(o);

    if (!dbAvailable) {
      if (!patientId) return res.json({ total: 0, entries: [] });
      const rows = getEntriesMem(patientId, l, o, since).map(r => ({ id: r.id, patientId: r.patientId, bpm: r.bpm, spo2: r.spo2, systolic: r.systolic, diastolic: r.diastolic, temperature: r.temperature, meta: r.meta, ts: r.ts }));
      return res.json({ total: rows.length, entries: rows });
    }

    const sql = `SELECT id, patient_id AS patientId, bpm, spo2, systolic, diastolic, temperature, meta, UNIX_TIMESTAMP(ts)*1000 AS ts FROM vitals ${where} ORDER BY ts DESC LIMIT ? OFFSET ?`;
    const [rows, qerr] = await safeQuery(sql, params);
    if (!rows) {
      if (!patientId) return res.json({ total: 0, entries: [] });
      const memRows = getEntriesMem(patientId, l, o, since).map(r => ({ id: r.id, patientId: r.patientId, bpm: r.bpm, spo2: r.spo2, systolic: r.systolic, diastolic: r.diastolic, temperature: r.temperature, meta: r.meta, ts: r.ts }));
      return res.json({ total: memRows.length, entries: memRows });
    }
    return res.json({ total: rows.length, entries: rows });
  } catch (err) {
    return handleError(res, err);
  }
});


// GET /api/vitals/latest -> retorna o(s) último(s) registro(s)
// Query params: patientId OR patientIds (comma separated)
app.get('/api/vitals/latest', async (req, res) => {
  try {
    const { patientId, patientIds } = req.query || {};

    if (!patientId && !patientIds) {
      return res.status(400).json({ error: 'patientId or patientIds is required' });
    }

    // helper to fetch one latest row for a patient
    const fetchLatestFor = async (pid) => {
      if (!dbAvailable) {
        const r = getLatestMem('vitals', pid);
        if (!r) return null;
        return { id: r.id, patientId: r.patientId, bpm: r.bpm, spo2: r.spo2, systolic: r.systolic, diastolic: r.diastolic, temperature: r.temperature, meta: r.meta, ts: r.ts };
      }
      const sql = `SELECT id, patient_id AS patientId, bpm, spo2, systolic, diastolic, temperature, meta, UNIX_TIMESTAMP(ts)*1000 AS ts FROM vitals WHERE patient_id = ? ORDER BY ts DESC LIMIT 1`;
      const [rows, qerr] = await safeQuery(sql, [pid]);
      if (!rows) return null;
      return rows && rows.length ? rows[0] : null;
    };

    if (patientId) {
      const row = await fetchLatestFor(patientId);
      return res.json({ entry: row });
    }

    // patientIds (comma separated)
    const ids = String(patientIds).split(',').map(s => s.trim()).filter(Boolean);
    const results = {};
    await Promise.all(ids.map(async (pid) => {
      results[pid] = await fetchLatestFor(pid);
    }));

    return res.json({ entries: results });
  } catch (err) {
    return handleError(res, err);
  }
});

// GET /api/vitals/esp1 -> último registro do ESP1 (cardio: bpm/spo2)
// Accepts: patientId or patientIds (comma separated)
app.get('/api/vitals/esp1', async (req, res) => {
  try {
    const { patientId, patientIds } = req.query || {};
    if (!patientId && !patientIds) return res.status(400).json({ error: 'patientId or patientIds is required' });
    // Read from dedicated esp1 table
    const fetchLatestFor = async (pid) => {
      if (!dbAvailable) {
        const r = getLatestMem('esp1', pid);
        if (!r) return null;
        return { id: r.id, patientId: r.patientId, bpm: r.bpm, spo2: r.spo2, systolic: r.systolic, diastolic: r.diastolic, meta: r.meta, ts: r.ts };
      }
      const sql = `SELECT id, patient_id AS patientId, bpm, spo2, systolic, diastolic, meta, UNIX_TIMESTAMP(ts)*1000 AS ts FROM vitals_esp1 WHERE patient_id = ? ORDER BY ts DESC LIMIT 1`;
      const [rows, qerr] = await safeQuery(sql, [pid]);
      if (!rows) return null;
      return rows && rows.length ? rows[0] : null;
    };

    if (patientId) {
      const row = await fetchLatestFor(patientId);
      return res.json({ entry: row });
    }

    const ids = String(patientIds).split(',').map(s => s.trim()).filter(Boolean);
    const results = {};
    await Promise.all(ids.map(async (pid) => { results[pid] = await fetchLatestFor(pid); }));
    return res.json({ entries: results });
  } catch (err) {
    return handleError(res, err);
  }
});

// POST /api/vitals/esp1 -> insert a reading into vitals_esp1
app.post('/api/vitals/esp1', async (req, res) => {
  try {
    const body = req.body || {};
    const patientId = body.patientId || body.patient_id;
    if (!patientId) return res.status(400).json({ error: 'patientId is required' });

    const bpm = body.bpm != null ? parseInt(body.bpm, 10) : null;
    const spo2 = body.spo2 != null ? parseInt(body.spo2, 10) : null;
    const systolic = body.systolic != null ? parseInt(body.systolic, 10) : null;
    const diastolic = body.diastolic != null ? parseInt(body.diastolic, 10) : null;

    const metaObj = { ...body };
    delete metaObj.patientId; delete metaObj.patient_id; delete metaObj.bpm; delete metaObj.spo2; delete metaObj.systolic; delete metaObj.diastolic; delete metaObj.temperature;

    if (!dbAvailable) {
      const e = insertMem('esp1', { patientId, bpm, spo2, systolic, diastolic, meta: metaObj });
      return res.status(201).json({ ok: true, id: e.id });
    }

    const [result, qerr] = await safeQuery(
      `INSERT INTO vitals_esp1 (patient_id, bpm, spo2, systolic, diastolic, meta) VALUES (?, ?, ?, ?, ?, ?)`,
      [patientId, bpm, spo2, systolic, diastolic, JSON.stringify(metaObj)]
    );
    if (!result) {
      const e = insertMem('esp1', { patientId, bpm, spo2, systolic, diastolic, meta: metaObj });
      return res.status(201).json({ ok: true, id: e.id });
    }
    return res.status(201).json({ ok: true, id: result.insertId });
  } catch (err) {
    return handleError(res, err);
  }
});

// GET /api/vitals/esp2 -> último registro do ESP2 (temperatura)
// Accepts: patientId or patientIds (comma separated)
app.get('/api/vitals/esp2', async (req, res) => {
  try {
    const { patientId, patientIds } = req.query || { patientId: "paciente123" };
    if (!patientId && !patientIds) return res.status(400).json({ error: 'patientId or patientIds is required' });
    // Read from dedicated esp2 table
    const fetchLatestFor = async (pid) => {
      if (!dbAvailable) {
        const r = getLatestMem('esp2', pid);
        if (!r) return null;
        return { id: r.id, patientId: r.patientId, temperature: r.temperature, meta: r.meta, ts: r.ts };
      }
      const sql = `SELECT id, patient_id AS patientId, temperature, meta, UNIX_TIMESTAMP(ts)*1000 AS ts FROM vitals_esp2 WHERE patient_id = ? ORDER BY ts DESC LIMIT 1`;
      const [rows, qerr] = await safeQuery(sql, [pid]);
      if (!rows) return null;
      return rows && rows.length ? rows[0] : null;
    };

    if (patientId) {
      const row = await fetchLatestFor(patientId);
      return res.json({ entry: row });
    }

    const ids = String(patientIds).split(',').map(s => s.trim()).filter(Boolean);
    const results = {};
    await Promise.all(ids.map(async (pid) => { results[pid] = await fetchLatestFor(pid); }));
    return res.json({ entries: results });
  } catch (err) {
    return handleError(res, err);
  }
});

// POST /api/vitals/esp2 -> insert a reading into vitals_esp2
app.post('/api/vitals/esp2', async (req, res) => {
  try {
    const body = req.body || {};
    const patientId = body.patientId || body.patient_id;
    if (!patientId) return res.status(400).json({ error: 'patientId is required' });

    const temperature = body.temperature != null ? parseFloat(body.temperature) : null;

    const metaObj = { ...body };
    delete metaObj.patientId; delete metaObj.patient_id; delete metaObj.bpm; delete metaObj.spo2; delete metaObj.systolic; delete metaObj.diastolic; delete metaObj.temperature;

    if (!dbAvailable) {
      const e = insertMem('esp2', { patientId, temperature, meta: metaObj });
      return res.status(201).json({ ok: true, id: e.id });
    }

    const [result, qerr] = await safeQuery(
      `INSERT INTO vitals_esp2 (patient_id, temperature, meta) VALUES (?, ?, ?)`,
      [patientId, temperature, JSON.stringify(metaObj)]
    );
    if (!result) {
      const e = insertMem('esp2', { patientId, temperature, meta: metaObj });
      return res.status(201).json({ ok: true, id: e.id });
    }
    return res.status(201).json({ ok: true, id: result.insertId });
  } catch (err) {
    return handleError(res, err);
  }
});


// Chama antes de iniciar o servidor
await initDatabase();
// --------------------
// Helpers
// --------------------
const handleError = (res, err) => {
  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
};

// Simple input sanitizer for objects used with `SET ?`
// Removes undefined keys to avoid inserting them.
const clean = (obj) => {
  const out = {};
  Object.keys(obj).forEach((k) => {
    if (obj[k] !== undefined) out[k] = obj[k];
  });
  return out;
};
// Endpoint raiz para verificar status do servidor
app.get("/", (req, res) => {
  res.send("Servidor rodando");
});
// Endpoint para listar todas as tabelas do banco de dados
app.get("/tabelas", async (req, res) => {
  try {
    if (!dbAvailable) {
      const tabelas = ['vitals', 'vitals_esp1', 'vitals_esp2'];
      return res.json({ sucesso: true, total: tabelas.length, tabelas });
    }

    const [rows, qerr] = await safeQuery("SHOW TABLES");
    if (!rows) {
      const tabelas = ['vitals', 'vitals_esp1', 'vitals_esp2'];
      return res.json({ sucesso: true, total: tabelas.length, tabelas });
    }
    // Extrai o nome das tabelas (a chave depende do nome do banco)
    const tabelas = rows.map(row => Object.values(row)[0]);
    res.json({ sucesso: true, total: tabelas.length, tabelas });
  } catch (err) {
    console.error("Erro ao listar tabelas:", err.message);
    res.status(500).json({
      sucesso: false,
      erro: "Erro ao listar tabelas do banco de dados."
    });
  }
});



const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
app.listen(PORT, () => console.log(`SIpre AVC API rodando na porta ${PORT}`));
