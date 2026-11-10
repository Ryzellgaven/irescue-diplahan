-- Run only for an existing installation of the previous standalone /xampp
-- portal. Back up ldrrmo_xampp first. This preserves the old tables until
-- stage 2 has copied their rows into the unified schema.
USE ldrrmo_xampp;

RENAME TABLE
  emergency_reports TO legacy_emergency_reports,
  sensors TO legacy_sensors,
  sensor_readings TO legacy_sensor_readings,
  report_status_history TO legacy_report_status_history,
  audit_logs TO legacy_audit_logs;
