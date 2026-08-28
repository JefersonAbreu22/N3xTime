-- CreateTable
CREATE TABLE `companies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `legal_name` VARCHAR(255) NOT NULL,
    `trade_name` VARCHAR(255) NULL,
    `slug` VARCHAR(80) NOT NULL,
    `cnpj` VARCHAR(18) NULL,
    `status` ENUM('active', 'inactive', 'suspended') NOT NULL DEFAULT 'active',
    `kiosk_access_key_hash` VARCHAR(255) NULL,
    `kiosk_access_key_fingerprint` VARCHAR(64) NULL,
    `created_at` DATETIME(0) NOT NULL,
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `slug`(`slug`),
    UNIQUE INDEX `cnpj`(`cnpj`),
    UNIQUE INDEX `kiosk_access_key_fingerprint`(`kiosk_access_key_fingerprint`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `company_profiles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `legal_name` VARCHAR(255) NOT NULL DEFAULT 'Empresa não configurada',
    `trade_name` VARCHAR(255) NULL,
    `cnpj` VARCHAR(18) NULL,
    `email` VARCHAR(255) NULL,
    `phone` VARCHAR(30) NULL,
    `address_line` VARCHAR(255) NULL,
    `city` VARCHAR(120) NULL,
    `state` VARCHAR(80) NULL,
    `zip_code` VARCHAR(20) NULL,
    `night_shift_start` VARCHAR(5) NOT NULL DEFAULT '22:00',
    `night_shift_end` VARCHAR(5) NOT NULL DEFAULT '05:00',
    `late_tolerance_minutes` INTEGER NOT NULL DEFAULT 5,
    `lunch_tolerance_minutes` INTEGER NOT NULL DEFAULT 10,
    `latitude` DECIMAL(10, 8) NULL,
    `longitude` DECIMAL(11, 8) NULL,
    `allowed_radius` INTEGER NULL DEFAULT 200,
    `block_outside_area` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(0) NOT NULL,
    `company_id` INTEGER NOT NULL,

    UNIQUE INDEX `company_profiles_company_id`(`company_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `departments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `created_at` DATETIME(0) NOT NULL,
    `company_id` INTEGER NOT NULL,

    INDEX `departments_company_id`(`company_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `work_schedules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `type` ENUM('fixed', '12x36', 'rotative', 'custom') NOT NULL,
    `entry_time` TIME(0) NULL,
    `exit_time` TIME(0) NULL,
    `lunch_duration` INTEGER NULL,
    `flexible_lunch` BOOLEAN NOT NULL DEFAULT true,
    `work_days` JSON NULL,
    `custom_workload` JSON NULL,
    `created_at` DATETIME(0) NOT NULL,
    `company_id` INTEGER NOT NULL,

    INDEX `work_schedules_company_id`(`company_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `cpf` VARCHAR(14) NOT NULL,
    `registration_number` VARCHAR(50) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` ENUM('admin', 'manager', 'employee') NOT NULL,
    `work_type` ENUM('presential', 'hybrid', 'remote') NOT NULL,
    `department_id` INTEGER NULL,
    `manager_id` INTEGER NULL,
    `schedule_id` INTEGER NULL,
    `pin_code` VARCHAR(255) NULL,
    `facial_descriptor` LONGTEXT NULL,
    `status` ENUM('active', 'inactive') NULL DEFAULT 'active',
    `hire_date` DATE NULL,
    `remote_clock_in_enabled` BOOLEAN NOT NULL DEFAULT false,
    `remote_clock_in_justification` TEXT NULL,
    `must_change_password` BOOLEAN NOT NULL DEFAULT false,
    `requires_time_tracking` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(0) NOT NULL,
    `company_id` INTEGER NOT NULL,

    UNIQUE INDEX `users_email_unique`(`email`),
    INDEX `users_company_id`(`company_id`),
    UNIQUE INDEX `users_company_id_cpf`(`company_id`, `cpf`),
    UNIQUE INDEX `users_company_id_registration_number`(`company_id`, `registration_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_summaries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `worked_minutes` INTEGER NOT NULL DEFAULT 0,
    `required_minutes` INTEGER NOT NULL DEFAULT 0,
    `late_minutes` INTEGER NOT NULL DEFAULT 0,
    `overtime_minutes` INTEGER NOT NULL DEFAULT 0,
    `deficit_minutes` INTEGER NOT NULL DEFAULT 0,
    `bank_balance_minutes` INTEGER NOT NULL DEFAULT 0,
    `night_minutes` INTEGER NOT NULL DEFAULT 0,
    `holiday_worked_minutes` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('absent', 'in_progress', 'complete', 'holiday', 'day_off', 'justified') NOT NULL DEFAULT 'absent',
    `has_complete_journey` BOOLEAN NOT NULL DEFAULT false,
    `is_holiday` BOOLEAN NOT NULL DEFAULT false,
    `is_justified_absence` BOOLEAN NOT NULL DEFAULT false,
    `record_count` INTEGER NOT NULL DEFAULT 0,
    `first_record_time` DATETIME(0) NULL,
    `last_record_time` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL,
    `updated_at` DATETIME(0) NOT NULL,
    `company_id` INTEGER NOT NULL,

    INDEX `attendance_summaries_company_id`(`company_id`),
    UNIQUE INDEX `attendance_summaries_user_id_date`(`user_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NULL,
    `action` VARCHAR(255) NOT NULL,
    `entity_name` VARCHAR(255) NOT NULL,
    `entity_id` INTEGER NULL,
    `old_value` TEXT NULL,
    `new_value` TEXT NULL,
    `ip_address` VARCHAR(255) NULL,
    `device_info` TEXT NULL,
    `created_at` DATETIME(0) NOT NULL,
    `company_id` INTEGER NOT NULL,

    INDEX `audit_logs_company_id`(`company_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `biometric_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NULL,
    `event_type` ENUM('enrollment', 'verification_success', 'verification_failure', 'pin_fallback', 'reset') NOT NULL,
    `method` ENUM('facial', 'pin', 'manual', 'web') NOT NULL,
    `success` BOOLEAN NOT NULL DEFAULT true,
    `match_score` DECIMAL(8, 4) NULL,
    `threshold` DECIMAL(8, 4) NULL,
    `reason` VARCHAR(255) NULL,
    `triggered_by` INTEGER NULL,
    `device_info` TEXT NULL,
    `metadata` LONGTEXT NULL,
    `created_at` DATETIME(0) NOT NULL,
    `company_id` INTEGER NOT NULL,

    INDEX `biometric_events_user_id`(`user_id`),
    INDEX `biometric_events_event_type`(`event_type`),
    INDEX `biometric_events_company_id`(`company_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `biometric_samples` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `descriptor` LONGTEXT NOT NULL,
    `quality_score` DECIMAL(5, 2) NULL,
    `sample_index` INTEGER NOT NULL,
    `captured_by` INTEGER NULL,
    `created_at` DATETIME(0) NOT NULL,
    `company_id` INTEGER NOT NULL,

    INDEX `biometric_samples_user_id`(`user_id`),
    INDEX `biometric_samples_company_id`(`company_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `department_hierarchy_levels` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `department_id` INTEGER NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `position` INTEGER NOT NULL,
    `created_at` DATETIME(0) NOT NULL,
    `updated_at` DATETIME(0) NOT NULL,
    `company_id` INTEGER NOT NULL,

    INDEX `department_hierarchy_levels_company_id`(`company_id`),
    UNIQUE INDEX `department_hierarchy_levels_department_position`(`company_id`, `department_id`, `position`),
    UNIQUE INDEX `department_hierarchy_levels_department_name`(`company_id`, `department_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `department_leader_assignments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `department_id` INTEGER NOT NULL,
    `level_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `permissions` JSON NOT NULL,
    `created_at` DATETIME(0) NOT NULL,
    `updated_at` DATETIME(0) NOT NULL,
    `company_id` INTEGER NOT NULL,

    INDEX `department_leader_assignments_company_id`(`company_id`),
    UNIQUE INDEX `department_leader_assignments_user_level`(`company_id`, `department_id`, `level_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_delivery_failures` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `record_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `recipient` VARCHAR(255) NOT NULL,
    `error_message` TEXT NOT NULL,
    `smtp_code` VARCHAR(80) NULL,
    `attempted_at` DATETIME(0) NOT NULL,
    `created_at` DATETIME(0) NOT NULL,
    `company_id` INTEGER NOT NULL,

    INDEX `email_delivery_failures_record_id`(`record_id`),
    INDEX `email_delivery_failures_user_id`(`user_id`),
    INDEX `email_delivery_failures_attempted_at`(`attempted_at`),
    INDEX `email_delivery_failures_company_id`(`company_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_delivery_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `record_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `recipient` VARCHAR(255) NOT NULL,
    `status` ENUM('sent', 'failed') NOT NULL,
    `smtp_code` VARCHAR(80) NULL,
    `message_id` VARCHAR(255) NULL,
    `smtp_response` TEXT NULL,
    `error_message` TEXT NULL,
    `attempted_at` DATETIME(0) NOT NULL,
    `created_at` DATETIME(0) NOT NULL,
    `company_id` INTEGER NOT NULL,

    INDEX `email_delivery_logs_record_id`(`record_id`),
    INDEX `email_delivery_logs_user_id`(`user_id`),
    INDEX `email_delivery_logs_status`(`status`),
    INDEX `email_delivery_logs_attempted_at`(`attempted_at`),
    INDEX `email_delivery_logs_company_id`(`company_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employee_requests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `reviewed_by` INTEGER NULL,
    `target_manager_id` INTEGER NULL,
    `target_department_id` INTEGER NULL,
    `request_type` ENUM('time_adjustment', 'medical_certificate', 'declaration', 'vacation', 'day_off', 'external_work') NOT NULL,
    `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    `target_date` DATE NOT NULL,
    `requested_entry_time` VARCHAR(5) NULL,
    `requested_lunch_start` VARCHAR(5) NULL,
    `requested_lunch_end` VARCHAR(5) NULL,
    `requested_exit_time` VARCHAR(5) NULL,
    `reason` TEXT NOT NULL,
    `attachment_name` VARCHAR(255) NULL,
    `attachment_url` TEXT NULL,
    `admin_comment` TEXT NULL,
    `reviewed_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL,
    `company_id` INTEGER NOT NULL,

    INDEX `employee_requests_company_id`(`company_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `holidays` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `holiday_date` DATE NOT NULL,
    `is_paid` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(0) NOT NULL,
    `company_id` INTEGER NOT NULL,

    INDEX `holidays_company_id`(`company_id`),
    UNIQUE INDEX `holidays_company_id_holiday_date`(`company_id`, `holiday_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `kiosk_controls` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `session_version` INTEGER NOT NULL DEFAULT 1,
    `terminal_enabled` BOOLEAN NOT NULL DEFAULT false,
    `last_revoked_at` DATETIME(0) NULL,
    `released_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL,
    `company_id` INTEGER NOT NULL,

    UNIQUE INDEX `kiosk_controls_company_id`(`company_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `monthly_closings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `period_month` VARCHAR(7) NOT NULL,
    `period_start` DATE NOT NULL,
    `period_end` DATE NOT NULL,
    `status` ENUM('open', 'closed') NOT NULL DEFAULT 'open',
    `snapshot` JSON NULL,
    `notes` TEXT NULL,
    `reopen_reason` TEXT NULL,
    `closed_by` INTEGER NULL,
    `closed_at` DATETIME(0) NULL,
    `reopened_by` INTEGER NULL,
    `reopened_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL,
    `company_id` INTEGER NOT NULL,

    INDEX `monthly_closings_company_id`(`company_id`),
    UNIQUE INDEX `monthly_closings_company_id_period_month`(`company_id`, `period_month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `created_at` DATETIME(0) NOT NULL,
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `email`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_audit_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `platform_user_id` INTEGER NOT NULL,
    `company_id` INTEGER NULL,
    `action` VARCHAR(100) NOT NULL,
    `metadata` JSON NULL,
    `ip_address` VARCHAR(64) NULL,
    `created_at` DATETIME(0) NOT NULL,

    INDEX `platform_audit_logs_platform_user_id_created_at`(`platform_user_id`, `created_at`),
    INDEX `platform_audit_logs_company_id_created_at`(`company_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `remote_photo_evidences` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `record_id` INTEGER NOT NULL,
    `photo_data` LONGBLOB NULL,
    `mime_type` VARCHAR(80) NOT NULL,
    `expires_at` DATETIME(0) NOT NULL,
    `deleted_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL,
    `company_id` INTEGER NOT NULL,

    UNIQUE INDEX `record_id`(`record_id`),
    INDEX `remote_photo_evidences_expires_at`(`expires_at`),
    INDEX `remote_photo_evidences_deleted_at`(`deleted_at`),
    INDEX `remote_photo_evidences_company_id`(`company_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `time_records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `record_time` DATETIME(0) NOT NULL,
    `record_type` ENUM('entry', 'lunch_start', 'lunch_end', 'exit', 'auto') NOT NULL,
    `method` ENUM('facial', 'pin', 'manual', 'web') NOT NULL,
    `latitude` DECIMAL(10, 8) NULL,
    `longitude` DECIMAL(11, 8) NULL,
    `location_distance` INTEGER NULL,
    `location_status` ENUM('approved', 'out_of_area') NULL,
    `photo_url` VARCHAR(255) NULL,
    `ip_address` VARCHAR(45) NULL,
    `device_info` TEXT NULL,
    `gps_accuracy` DECIMAL(10, 2) NULL,
    `trust_level` ENUM('high', 'medium', 'low') NOT NULL DEFAULT 'medium',
    `status` ENUM('valid', 'pending_approval', 'rejected', 'adjusted') NULL DEFAULT 'valid',
    `reviewed_by` INTEGER NULL,
    `review_reason` TEXT NULL,
    `reviewed_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL,
    `company_id` INTEGER NOT NULL,

    INDEX `time_records_company_id`(`company_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `company_profiles` ADD CONSTRAINT `company_profiles_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `departments` ADD CONSTRAINT `departments_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `work_schedules` ADD CONSTRAINT `work_schedules_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_ibfk_4` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_ibfk_1` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_ibfk_2` FOREIGN KEY (`manager_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_ibfk_3` FOREIGN KEY (`schedule_id`) REFERENCES `work_schedules`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_summaries` ADD CONSTRAINT `attendance_summaries_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_summaries` ADD CONSTRAINT `attendance_summaries_ibfk_2` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `biometric_events` ADD CONSTRAINT `biometric_events_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `biometric_events` ADD CONSTRAINT `biometric_events_ibfk_2` FOREIGN KEY (`triggered_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `biometric_events` ADD CONSTRAINT `biometric_events_ibfk_3` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `biometric_samples` ADD CONSTRAINT `biometric_samples_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `biometric_samples` ADD CONSTRAINT `biometric_samples_ibfk_2` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `department_hierarchy_levels` ADD CONSTRAINT `department_hierarchy_levels_ibfk_1` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `department_hierarchy_levels` ADD CONSTRAINT `department_hierarchy_levels_ibfk_2` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `department_leader_assignments` ADD CONSTRAINT `department_leader_assignments_ibfk_1` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `department_leader_assignments` ADD CONSTRAINT `department_leader_assignments_ibfk_2` FOREIGN KEY (`level_id`) REFERENCES `department_hierarchy_levels`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `department_leader_assignments` ADD CONSTRAINT `department_leader_assignments_ibfk_3` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `department_leader_assignments` ADD CONSTRAINT `department_leader_assignments_ibfk_4` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `email_delivery_failures` ADD CONSTRAINT `email_delivery_failures_ibfk_1` FOREIGN KEY (`record_id`) REFERENCES `time_records`(`id`) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_delivery_failures` ADD CONSTRAINT `email_delivery_failures_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_delivery_failures` ADD CONSTRAINT `email_delivery_failures_ibfk_3` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `email_delivery_logs` ADD CONSTRAINT `email_delivery_logs_ibfk_1` FOREIGN KEY (`record_id`) REFERENCES `time_records`(`id`) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_delivery_logs` ADD CONSTRAINT `email_delivery_logs_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_delivery_logs` ADD CONSTRAINT `email_delivery_logs_ibfk_3` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `employee_requests` ADD CONSTRAINT `employee_requests_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee_requests` ADD CONSTRAINT `employee_requests_ibfk_2` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee_requests` ADD CONSTRAINT `employee_requests_ibfk_3` FOREIGN KEY (`target_manager_id`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `employee_requests` ADD CONSTRAINT `employee_requests_ibfk_4` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `holidays` ADD CONSTRAINT `holidays_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `kiosk_controls` ADD CONSTRAINT `kiosk_controls_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `monthly_closings` ADD CONSTRAINT `monthly_closings_ibfk_1` FOREIGN KEY (`closed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `monthly_closings` ADD CONSTRAINT `monthly_closings_ibfk_2` FOREIGN KEY (`reopened_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `monthly_closings` ADD CONSTRAINT `monthly_closings_ibfk_3` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `platform_audit_logs` ADD CONSTRAINT `platform_audit_logs_ibfk_1` FOREIGN KEY (`platform_user_id`) REFERENCES `platform_users`(`id`) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `platform_audit_logs` ADD CONSTRAINT `platform_audit_logs_ibfk_2` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `remote_photo_evidences` ADD CONSTRAINT `remote_photo_evidences_ibfk_1` FOREIGN KEY (`record_id`) REFERENCES `time_records`(`id`) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `remote_photo_evidences` ADD CONSTRAINT `remote_photo_evidences_ibfk_2` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `time_records` ADD CONSTRAINT `time_records_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `time_records` ADD CONSTRAINT `time_records_ibfk_2` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `time_records` ADD CONSTRAINT `time_records_ibfk_3` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
