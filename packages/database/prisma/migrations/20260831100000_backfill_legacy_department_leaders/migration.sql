-- Preserve leadership imported from versions that only used users.role/manager_id.
UPDATE `users` AS `leader`
INNER JOIN (
  SELECT `company_id`, `manager_id`
  FROM `users`
  WHERE `status` = 'active' AND `manager_id` IS NOT NULL
  GROUP BY `company_id`, `manager_id`
) AS `managed`
  ON `managed`.`company_id` = `leader`.`company_id`
 AND `managed`.`manager_id` = `leader`.`id`
SET `leader`.`role` = 'manager'
WHERE `leader`.`status` = 'active'
  AND `leader`.`department_id` IS NOT NULL;

INSERT INTO `department_hierarchy_levels`
  (`company_id`, `department_id`, `name`, `position`, `created_at`, `updated_at`)
SELECT DISTINCT
  `manager`.`company_id`, `manager`.`department_id`, 'Líder', 1, NOW(), NOW()
FROM `users` AS `manager`
WHERE `manager`.`status` = 'active'
  AND `manager`.`role` = 'manager'
  AND `manager`.`department_id` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM `department_hierarchy_levels` AS `level`
    WHERE `level`.`company_id` = `manager`.`company_id`
      AND `level`.`department_id` = `manager`.`department_id`
  );

INSERT INTO `department_leader_assignments`
  (`company_id`, `department_id`, `level_id`, `user_id`, `permissions`, `created_at`, `updated_at`)
SELECT
  `manager`.`company_id`,
  `manager`.`department_id`,
  `level`.`id`,
  `manager`.`id`,
  JSON_ARRAY(
    'view_team',
    'manage_team',
    'view_time_records',
    'manage_time_records',
    'approve_requests',
    'view_reports',
    'manage_biometrics'
  ),
  NOW(),
  NOW()
FROM `users` AS `manager`
INNER JOIN `department_hierarchy_levels` AS `level`
  ON `level`.`company_id` = `manager`.`company_id`
 AND `level`.`department_id` = `manager`.`department_id`
 AND `level`.`position` = 1
 AND `level`.`name` = 'Líder'
WHERE `manager`.`status` = 'active'
  AND `manager`.`role` = 'manager'
  AND `manager`.`department_id` IS NOT NULL
  AND (
    SELECT COUNT(*)
    FROM `department_hierarchy_levels` AS `department_level`
    WHERE `department_level`.`company_id` = `manager`.`company_id`
      AND `department_level`.`department_id` = `manager`.`department_id`
  ) = 1
  AND NOT EXISTS (
    SELECT 1
    FROM `department_leader_assignments` AS `assignment`
    WHERE `assignment`.`company_id` = `manager`.`company_id`
      AND `assignment`.`user_id` = `manager`.`id`
  );
