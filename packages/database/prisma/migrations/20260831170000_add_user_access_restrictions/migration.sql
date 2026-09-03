-- AlterTable
ALTER TABLE `users`
    MODIFY `status` ENUM('active', 'suspended', 'inactive') NOT NULL DEFAULT 'active',
    ADD COLUMN `suspended_at` DATETIME(0) NULL,
    ADD COLUMN `suspended_by` INTEGER NULL,
    ADD COLUMN `suspension_reason` TEXT NULL,
    ADD COLUMN `suspension_type` ENUM(
        'temporary_suspension',
        'inss_leave',
        'occupational_leave',
        'parental_leave',
        'unpaid_leave',
        'permanent_disability_retirement',
        'military_service',
        'union_or_elective_mandate',
        'family_care_leave',
        'protective_measure',
        'judicial_detention',
        'other_leave',
        'termination'
    ) NULL,
    ADD COLUMN `suspension_start_date` DATE NULL,
    ADD COLUMN `suspension_end_at` DATETIME(0) NULL;

CREATE INDEX `users_company_id_status` ON `users`(`company_id`, `status`);
CREATE INDEX `users_company_id_suspension_end_at` ON `users`(`company_id`, `suspension_end_at`);
