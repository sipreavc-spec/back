-- Tabela para armazenar utilizadores (médicos e pacientes)
CREATE TABLE IF NOT EXISTS `users` (
	`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	`email` VARCHAR(255) NOT NULL UNIQUE,
	`password_hash` VARCHAR(255) NOT NULL,
	`name` VARCHAR(255) NOT NULL,
	`role` ENUM('doctor', 'patient') NOT NULL,
	`patientId` VARCHAR(128) NULL UNIQUE,
	`specialization` VARCHAR(255) NULL,
	`createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (`id`),
	INDEX `idx_email` (`email`),
	INDEX `idx_patientId` (`patientId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela para armazenar leituras de sinais vitais enviadas pelos dispositivos (ESP32)
CREATE TABLE IF NOT EXISTS `vitals` (
	`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	`patient_id` VARCHAR(128) NOT NULL,
	`bpm` INT NULL,
	`spo2` INT NULL,
	`systolic` INT NULL,
	`diastolic` INT NULL,
	`temperature` DOUBLE NULL,
	`meta` JSON NULL,
	`ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (`id`),
	INDEX `idx_patient_ts` (`patient_id`, `ts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela dedicada para leituras do ESP1 (cardio: bpm, spo2, pressão)
CREATE TABLE IF NOT EXISTS `vitals_esp1` (
	`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	`patient_id` VARCHAR(128) NOT NULL,
	`bpm` INT NULL,
	`spo2` INT NULL,
	`systolic` INT NULL,
	`diastolic` INT NULL,
	`meta` JSON NULL,
	`ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (`id`),
	INDEX `idx_esp1_patient_ts` (`patient_id`, `ts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela dedicada para leituras do ESP2 (temperatura)
CREATE TABLE IF NOT EXISTS `vitals_esp2` (
	`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	`patient_id` VARCHAR(128) NOT NULL,
	`temperature` DOUBLE NULL,
	`meta` JSON NULL,
	`ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (`id`),
	INDEX `idx_esp2_patient_ts` (`patient_id`, `ts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

