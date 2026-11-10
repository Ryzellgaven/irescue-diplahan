-- Run after stage 1 and after importing database.sql. This copies account
-- credentials, incident history, sensors/readings, and audit rows while
-- preserving primary IDs. Legacy source tables are retained for verification.
USE ldrrmo_xampp;

INSERT IGNORE INTO profiles
  (id,email,full_name,password_hash,role,is_active,created_at,updated_at)
SELECT id,email,full_name,password_hash,role,is_active,created_at,updated_at
FROM staff_users;

INSERT IGNORE INTO emergency_reports
  (id,reporter_id,emergency_type,severity,description,latitude,longitude,address_text,status,created_at,updated_at)
SELECT id,reporter_id,emergency_type,severity,description,latitude,longitude,location,status,created_at,updated_at
FROM legacy_emergency_reports;

INSERT IGNORE INTO iot_devices
  (id,device_code,name,latitude,longitude,sensor_type,alert_threshold,alert_unit,status,device_token_hash,created_at,updated_at)
SELECT id,device_code,name,latitude,longitude,sensor_type,alert_threshold,unit,status,device_token_hash,created_at,updated_at
FROM legacy_sensors;

INSERT IGNORE INTO sensor_readings
  (id,device_id,value,unit,is_alert,recorded_at)
SELECT r.id,r.sensor_id,r.reading,s.unit,r.is_alert,r.recorded_at
FROM legacy_sensor_readings r
JOIN legacy_sensors s ON s.id=r.sensor_id;

INSERT IGNORE INTO status_updates
  (id,report_id,updated_by,old_status,new_status,created_at)
SELECT id,report_id,changed_by,old_status,new_status,changed_at
FROM legacy_report_status_history;

INSERT IGNORE INTO audit_logs
  (id,user_id,action,table_name,record_id,ip_address,created_at)
SELECT id,user_id,action,record_type,CAST(record_id AS CHAR),ip_address,created_at
FROM legacy_audit_logs;

RENAME TABLE staff_users TO legacy_staff_users;
