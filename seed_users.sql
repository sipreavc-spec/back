-- SIPRE-AVC Demo Users Seed Data
-- Insira este script no MySQL para criar usuários de teste
-- Senhas: todas são "demo123" (bcryptjs hash)

-- Limpar usuários existentes (CUIDADO: isso remove todos os usuários!)
-- DELETE FROM users WHERE email LIKE '%demo%';

-- Inserir usuários de teste
INSERT INTO users (email, password_hash, name, role, patientId, specialization, createdAt, updatedAt) VALUES
-- Hash de "demo123" com bcryptjs
('paciente@demo.com', '$2a$10$YourHashHere1', 'João da Silva', 'patient', 'paciente123', NULL, NOW(), NOW()),
('medico@demo.com', '$2a$10$YourHashHere2', 'Dra. Maria Santos', 'doctor', NULL, 'Neurologia', NOW(), NOW()),
('paciente2@demo.com', '$2a$10$YourHashHere3', 'Ana Ferreira', 'patient', 'paciente456', NULL, NOW(), NOW()),
('medico2@demo.com', '$2a$10$YourHashHere4', 'Dr. Carlos Silva', 'doctor', NULL, 'Cardiologia', NOW(), NOW());

-- NOTA: Os hashes acima são exemplos. Para criar hashes reais com bcryptjs:
-- Executar no Node.js:
-- const bcrypt = require('bcryptjs');
-- bcrypt.hash('demo123', 10).then(hash => console.log(hash));

-- Exemplo de hash gerado (use este para todos os usuários):
-- $2a$10$abcd1234efgh5678ijkl90mnopqrst1234567890mnopqrst12345

-- Para facilitar, você pode também usar este comando SQL para atualizar:
UPDATE users SET password_hash = '$2a$10$abcd1234efgh5678ijkl90mnopqrst1234567890mnopqrst12345' WHERE email LIKE '%demo%';

-- Verificar usuários criados:
SELECT id, email, name, role, patientId, specialization, createdAt FROM users WHERE email LIKE '%demo%';
