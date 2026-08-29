CREATE TABLE `accounts` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `status` ENUM('active','inactive') NOT NULL DEFAULT 'active',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `accounts_email_unique` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `company_memberships` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `account_id` INT NOT NULL,
  `company_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `status` ENUM('active','inactive') NOT NULL DEFAULT 'active',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `company_memberships_account_company` (`account_id`,`company_id`),
  UNIQUE KEY `company_memberships_user_unique` (`user_id`),
  KEY `company_memberships_company_id` (`company_id`),
  CONSTRAINT `company_memberships_account_fk` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `company_memberships_company_fk` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `company_memberships_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tenant_transfer_logs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `company_id` INT NOT NULL,
  `platform_user_id` INT NOT NULL,
  `operation` ENUM('import','backup') NOT NULL,
  `filename` VARCHAR(255) NOT NULL,
  `status` ENUM('running','success','failed') NOT NULL DEFAULT 'running',
  `rows_processed` INT NOT NULL DEFAULT 0,
  `details` LONGTEXT NULL,
  `error_message` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finished_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `tenant_transfer_logs_company_created` (`company_id`,`created_at`),
  CONSTRAINT `tenant_transfer_logs_company_fk` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `tenant_transfer_logs_platform_user_fk` FOREIGN KEY (`platform_user_id`) REFERENCES `platform_users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `accounts` (`name`,`email`,`password_hash`,`status`,`created_at`,`updated_at`)
SELECT `name`,LOWER(`email`),`password_hash`,`status`,`created_at`,NOW() FROM `users`;

INSERT INTO `company_memberships` (`account_id`,`company_id`,`user_id`,`status`,`created_at`,`updated_at`)
SELECT a.id,u.company_id,u.id,u.status,NOW(),NOW() FROM users u INNER JOIN accounts a ON a.email=LOWER(u.email);

ALTER TABLE `users` DROP INDEX `users_email_unique`;
ALTER TABLE `users` ADD UNIQUE INDEX `users_company_id_email` (`company_id`,`email`);
