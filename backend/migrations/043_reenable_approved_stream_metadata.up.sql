UPDATE station_streams AS ss
SET
    metadata_enabled = true,
    updated_at = NOW()
FROM stations AS st
WHERE st.id = ss.station_id
  AND st.status = 'approved'
  AND st.is_active = true
  AND ss.is_active = true
  AND ss.metadata_enabled = false;
