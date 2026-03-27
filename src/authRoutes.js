// ════════════════════════════════════════════════════════════════════════════════
// Authentication & Patient Management Routes
// ════════════════════════════════════════════════════════════════════════════════

import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "./index.js";

const authRouter = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-prod";

// ────────────────────────────────────────────────────────────────
// Middleware: Verificar JWT
// ────────────────────────────────────────────────────────────────
export const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token não fornecido" });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    req.userRole = decoded.role;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }
};

// ────────────────────────────────────────────────────────────────
// POST /api/auth/register - Registrar novo usuário (Médico/Enfermeiro)
// ────────────────────────────────────────────────────────────────
authRouter.post("/register", async (req, res) => {
  try {
    const { email, password, full_name, role, crm, phone, specialization, hospital } = req.body;

    if (!email || !password || !full_name) {
      return res.status(400).json({ error: "Email, senha e nome são obrigatórios" });
    }

    if (!["doctor", "nurse", "admin"].includes(role)) {
      return res.status(400).json({ error: "Role inválida" });
    }

    // Verificar se email já existe
    const [existingUser] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
    if (existingUser.length > 0) {
      return res.status(400).json({ error: "Email já registrado" });
    }

    // Hash da senha
    const passwordHash = await bcrypt.hash(password, 10);

    // Inserir usuário
    const [result] = await pool.query(
      "INSERT INTO users (email, password_hash, full_name, role, crm, phone, specialization, hospital) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [email, passwordHash, full_name, role, crm || null, phone || null, specialization || null, hospital || null]
    );

    const userId = result.insertId;

    // Criar alert_limits padrão
    await pool.query(
      "INSERT INTO alert_limits (user_id) VALUES (?)",
      [userId]
    );

    // Gerar JWT
    const token = jwt.sign(
      { id: userId, email, role, full_name },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(201).json({
      ok: true,
      token,
      user: { id: userId, email, full_name, role },
    });
  } catch (err) {
    console.error("Erro no registro:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────
// POST /api/auth/login - Login de usuário
// ────────────────────────────────────────────────────────────────
authRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email e senha são obrigatórios" });
    }

    // Buscar usuário
    const [users] = await pool.query("SELECT id, email, password_hash, role, full_name FROM users WHERE email = ?", [email]);
    if (users.length === 0) {
      return res.status(401).json({ error: "Email ou senha incorretos" });
    }

    const user = users[0];

    // Verificar senha
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Email ou senha incorretos" });
    }

    // Gerar JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Erro no login:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────
// GET /api/auth/me - Obter dados do usuário autenticado
// ────────────────────────────────────────────────────────────────
authRouter.get("/me", verifyToken, async (req, res) => {
  try {
    const [users] = await pool.query(
      "SELECT id, email, full_name, role, crm, phone, specialization, hospital FROM users WHERE id = ?",
      [req.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    return res.json({ ok: true, user: users[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────
// POST /api/patients - Criar novo paciente
// ────────────────────────────────────────────────────────────────
authRouter.post("/patients", verifyToken, async (req, res) => {
  try {
    const { name, age, gender, email, phone, cpf, date_of_birth, address, medical_history, rfid_code, esp32_id } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Nome do paciente é obrigatório" });
    }

    const [result] = await pool.query(
      "INSERT INTO patients (name, age, gender, email, phone, cpf, date_of_birth, address, medical_history, assigned_doctor_id, rfid_code, esp32_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [name, age || null, gender || null, email || null, phone || null, cpf || null, date_of_birth || null, address || null, medical_history || null, req.userId, rfid_code || null, esp32_id || null]
    );

    const patientId = result.insertId;

    return res.status(201).json({
      ok: true,
      patient: {
        id: patientId,
        name,
        age,
        gender,
        email,
        phone,
        assigned_doctor_id: req.userId,
      },
    });
  } catch (err) {
    console.error("Erro ao criar paciente:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────
// GET /api/patients - Listar pacientes do médico
// ────────────────────────────────────────────────────────────────
authRouter.get("/patients", verifyToken, async (req, res) => {
  try {
    const [patients] = await pool.query(
      "SELECT id, name, age, gender, email, phone, cpf, status, created_at FROM patients WHERE assigned_doctor_id = ? ORDER BY created_at DESC",
      [req.userId]
    );

    return res.json({ ok: true, patients });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────
// GET /api/patients/:id - Obter dados de um paciente
// ────────────────────────────────────────────────────────────────
authRouter.get("/patients/:id", verifyToken, async (req, res) => {
  try {
    const [patients] = await pool.query(
      "SELECT * FROM patients WHERE id = ? AND assigned_doctor_id = ?",
      [req.params.id, req.userId]
    );

    if (patients.length === 0) {
      return res.status(404).json({ error: "Paciente não encontrado" });
    }

    return res.json({ ok: true, patient: patients[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────
// PUT /api/patients/:id - Atualizar dados do paciente
// ────────────────────────────────────────────────────────────────
authRouter.put("/patients/:id", verifyToken, async (req, res) => {
  try {
    const { name, age, gender, email, phone, medical_history } = req.body;

    const [result] = await pool.query(
      "UPDATE patients SET name = ?, age = ?, gender = ?, email = ?, phone = ?, medical_history = ? WHERE id = ? AND assigned_doctor_id = ?",
      [name, age || null, gender || null, email || null, phone || null, medical_history || null, req.params.id, req.userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Paciente não encontrado" });
    }

    return res.json({ ok: true, message: "Paciente atualizado" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────
// GET /api/patients/:id/vitals - Obter vitais do paciente
// ────────────────────────────────────────────────────────────────
authRouter.get("/patients/:id/vitals", verifyToken, async (req, res) => {
  try {
    const limit = req.query.limit || 100;

    const [vitals] = await pool.query(
      `SELECT id, bpm, spo2, systolic, diastolic, temperature, created_at 
       FROM vitals WHERE patient_id = ? ORDER BY created_at DESC LIMIT ?`,
      [req.params.id, parseInt(limit)]
    );

    return res.json({ ok: true, vitals });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default authRouter;
