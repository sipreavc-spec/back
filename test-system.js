#!/usr/bin/env node

/**
 * SIPRE-AVC Quick Test - Valida a configuração do sistema
 * 
 * Testa:
 * 1. Conexão com MySQL
 * 2. Tabela users existe
 * 3. Backend pode iniciar
 * 4. Endpoints estão respondendo
 */

const axios = require('axios');
const mysql = require('mysql2/promise');
require('dotenv').config();

const API_URL = 'http://localhost:3001/api';

async function testDatabase() {
  console.log('\n🔍 Testando conexão com MySQL...');
  try {
    const pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: 'require',
    });
    
    const conn = await pool.getConnection();
    console.log('✅ Conectado ao MySQL com sucesso!');
    
    // Verificar tabela users
    const [tables] = await conn.query(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'
    `, [process.env.DB_NAME]);
    
    if (tables.length > 0) {
      console.log('✅ Tabela "users" existe!');
    } else {
      console.log('❌ Tabela "users" NÃO encontrada. Execute init_db.sql');
      return false;
    }
    
    // Contar usuários
    const [users] = await conn.query('SELECT COUNT(*) as count FROM users');
    console.log(`✅ Banco contém ${users[0].count} usuários cadastrados`);
    
    conn.release();
    await pool.end();
    return true;
  } catch (error) {
    console.error('❌ Erro na conexão:', error.message);
    return false;
  }
}

async function testBackendAPI() {
  console.log('\n🔍 Testando endpoints da API...');
  
  try {
    // Teste 1: Login
    console.log('\n  1️⃣ Testando POST /auth/login');
    const loginRes = await axios.post(`${API_URL}/auth/login`, {
      email: 'paciente@demo.com',
      password: 'demo123'
    });
    
    if (loginRes.status === 200 && loginRes.data.token) {
      console.log('  ✅ Login funciona! Token recebido.');
      const token = loginRes.data.token;
      
      // Teste 2: Get Me
      console.log('\n  2️⃣ Testando GET /auth/me');
      const meRes = await axios.get(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (meRes.status === 200) {
        console.log(`  ✅ GET /auth/me funciona! Usuário: ${meRes.data.name}`);
      }
    } else {
      console.log('  ❌ Resposta inesperada no login');
      return false;
    }
    
    return true;
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error('  ❌ Backend não está respondendo em localhost:3001');
      console.error('     Execute: npm run dev (na pasta backend)');
    } else if (error.response?.status === 401) {
      console.error('  ❌ Credenciais inválidas. Verifique seed_users.js');
    } else {
      console.error('  ❌ Erro:', error.message);
    }
    return false;
  }
}

async function testFrontendEnv() {
  console.log('\n🔍 Verificando configuração do Frontend...');
  try {
    const fs = require('fs');
    const envPath = './sipre-avc-frontend/.env';
    
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      if (content.includes('VITE_API_URL=http://localhost:3001/api')) {
        console.log('✅ Frontend .env configurado corretamente');
        return true;
      } else {
        console.log('⚠️ VITE_API_URL pode estar incorreta');
        return false;
      }
    } else {
      console.log('❌ Arquivo .env não encontrado');
      return false;
    }
  } catch (error) {
    console.error('❌ Erro ao verificar .env:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   SIPRE-AVC System Health Check       ║');
  console.log('╚════════════════════════════════════════╝');
  
  const dbOk = await testDatabase();
  const frontendOk = await testFrontendEnv();
  
  console.log('\n🔍 Para testar API, certifique-se que o backend está rodando:');
  console.log('   npm run dev (na pasta backend)');
  
  // Tentar testar API se backend estiver rodando
  setTimeout(async () => {
    const apiOk = await testBackendAPI();
    
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║          RESULTADO DO TESTE            ║');
    console.log('╠════════════════════════════════════════╣');
    console.log(`║ Database.......: ${dbOk ? '✅ OK' : '❌ FAIL'}`);
    console.log(`║ Frontend Config: ${frontendOk ? '✅ OK' : '❌ FAIL'}`);
    console.log(`║ Backend API...: ${apiOk ? '✅ OK' : '❌ FAIL'} (Execute: npm run dev)`);
    console.log('╚════════════════════════════════════════╝\n');
    
    if (dbOk && frontendOk) {
      console.log('🎉 Sistema pronto para testes!');
      console.log('\n📋 Próximas etapas:');
      console.log('   1. npm run dev  (backend)');
      console.log('   2. npm run dev  (frontend)');
      console.log('   3. Abrir http://localhost:5173');
      process.exit(0);
    } else {
      console.log('⚠️ Alguns testes falharam. Verifique as mensagens acima.');
      process.exit(1);
    }
  }, 2000);
}

runTests();
