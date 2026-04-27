ALTER TABLE station_streams
  ADD COLUMN metadata_provider text,
  ADD COLUMN metadata_provider_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT station_streams_metadata_provider_check
    CHECK (metadata_provider IS NULL OR metadata_provider IN ('npr-composer', 'nts-live'));
