-- ════════════════════════════════════════════════════════════════════════════════
-- SIPRE-AVC Authentication & Patient Management Schema
-- ════════════════════════════════════════════════════════════════════════════════

-- Users table (Médicos/Enfermeiros/Admin)
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role ENUM('doctor', 'nurse', 'admin') DEFAULT 'doctor',
  crm VARCHAR(20),  -- Código de registro médico (apenas para doctors)
  phone VARCHAR(20),
  specialization VARCHAR(100),
  hospital VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Patients table
CREATE TABLE IF NOT EXISTS patients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  age INT,
  gender ENUM('M', 'F', 'O'),
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(20),
  cpf VARCHAR(14) UNIQUE,
  date_of_birth DATE,
  address TEXT,
  medical_history TEXT,
  assigned_doctor_id INT,
  rfid_code VARCHAR(50),
  esp32_id VARCHAR(50),
  status ENUM('active', 'recovered', 'archived') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (assigned_doctor_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_doctor(assigned_doctor_id),
  INDEX idx_rfid(rfid_code),
  INDEX idx_status(status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Vitals (already exists, but adding here for reference)
CREATE TABLE IF NOT EXISTS vitals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  bpm INT,
  spo2 INT,
  systolic INT,
  diastolic INT,
  temperature FLOAT,
  meta JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  INDEX idx_patient(patient_id),
  INDEX idx_created(created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Alerts table
CREATE TABLE IF NOT EXISTS alerts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  alert_type ENUM('critical', 'warning', 'info') DEFAULT 'info',
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  INDEX idx_patient(patient_id),
  INDEX idx_type(alert_type),
  INDEX idx_read(is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Alert limits per user
CREATE TABLE IF NOT EXISTS alert_limits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  bpm_max INT DEFAULT 100,
  bpm_min INT DEFAULT 50,
  spo2_min INT DEFAULT 90,
  temp_max FLOAT DEFAULT 38,
  temp_min FLOAT DEFAULT 35,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sessions (optional, for tracking login sessions)
CREATE TABLE IF NOT EXISTS sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash VARCHAR(255),
  ip_address VARCHAR(45),
  user_agent VARCHAR(500),
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user(user_id),
  INDEX idx_expires(expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
