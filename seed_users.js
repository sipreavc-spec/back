#!/usr/bin/env node

/**
 * SIPRE-AVC Demo Users Generator
 * 
 * Este script gera usuários de teste com senhas criptografadas
 * e os insere no banco de dados MySQL.
 * 
 * Uso: node seed_users.js
 */

const bcryptjs = require('bcryptjs');
const mysql = require('mysql2/promise');
require('dotenv').config();

const demoUsers = [
  {
    email: 'paciente@demo.com',
    password: 'demo123',
    name: 'João da Silva',
    role: 'patient',
    patientId: 'paciente123',
    specialization: null
  },
  {
    email: 'medico@demo.com',
    password: 'demo123',
    name: 'Dra. Maria Santos',
    role: 'doctor',
    patientId: null,
    specialization: 'Neurologia'
  },
  {
    email: 'paciente2@demo.com',
    password: 'demo123',
    name: 'Ana Ferreira',
    role: 'patient',
    patientId: 'paciente456',
    specialization: null
  },
  {
    email: 'medico2@demo.com',
    password: 'demo123',
    name: 'Dr. Carlos Silva',
    role: 'doctor',
    patientId: null,
    specialization: 'Cardiologia'
  }
];

async function seedUsers() {
  let pool;
  try {
    // Criar pool de conexão
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'mysql-1085aef7-sipreavc-3047.a.aivencloud.com',
      port: process.env.DB_PORT || 23447,
      user: process.env.DB_USER || 'avnadmin',
      password: process.env.DB_PASSWORD || 'AVNS_sJYrSIgSNDrMjvLDJjw',
      database: process.env.DB_NAME || 'sipreavc',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      ssl: 'require',
      enableKeepAlive: true,
      keepAliveInitialDelayMs: 30000
    });

    console.log('🔗 Conectando ao banco de dados...');
    const conn = await pool.getConnection();
    console.log('✅ Conexão estabelecida!');

    // Processar cada usuário
    for (const user of demoUsers) {
      try {
        // Gerar hash da senha
        const passwordHash = await bcryptjs.hash(user.password, 10);
        
        // Verificar se usuário já existe
        const [existing] = await conn.query(
          'SELECT id FROM users WHERE email = ?',
          [user.email]
        );

        if (existing.length > 0) {
          console.log(`⏭️  ${user.email} já existe. Pulando...`);
          continue;
        }

        // Inserir novo usuário
        const [result] = await conn.query(
          `INSERT INTO users (email, password_hash, name, role, patientId, specialization, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            user.email,
            passwordHash,
            user.name,
            user.role,
            user.patientId,
            user.specialization
          ]
        );

        console.log(`✅ Criado: ${user.email} (ID: ${result.insertId})`);
      } catch (err) {
        console.error(`❌ Erro ao criar ${user.email}:`, err.message);
      }
    }

    // Listar todos os usuários criados
    console.log('\n📋 Usuários cadastrados:');
    const [users] = await conn.query(
      'SELECT id, email, name, role, patientId, specialization, createdAt FROM users'
    );
    
    console.table(users);

    conn.release();
    await pool.end();
    
    console.log('\n✨ Seed completado com sucesso!');
    console.log('\n📝 Credenciais de teste:');
    console.log('   Paciente: paciente@demo.com / demo123');
    console.log('   Médico: medico@demo.com / demo123');
    
  } catch (error) {
    console.error('❌ Erro fatal:', error.message);
    process.exit(1);
  }
}

// Executar
seedUsers();
