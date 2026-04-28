UPDATE station_streams
SET
    metadata_enabled = true,
    updated_at = NOW()
WHERE metadata_enabled = false
  AND (
    COALESCE(NULLIF(BTRIM(metadata_provider), ''), NULL) IS NOT NULL
    OR COALESCE(NULLIF(BTRIM(metadata_source), ''), NULL) IS NOT NULL
    OR LOWER(COALESCE(metadata_resolver, '')) IN ('client', 'server')
    OR LOWER(COALESCE(metadata_url, '')) LIKE '%/status-json.xsl'
    OR LOWER(COALESCE(metadata_url, '')) LIKE '%/currentsong'
    OR LOWER(COALESCE(metadata_url, '')) LIKE '%/7.html'
  );
