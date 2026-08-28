-- AlterTable
ALTER TABLE `employee_requests`
    ADD COLUMN `absence_start_time` VARCHAR(5) NULL,
    ADD COLUMN `absence_end_time` VARCHAR(5) NULL;
