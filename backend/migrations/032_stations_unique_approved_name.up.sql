-- Approved-and-active stations must have a unique, case- and whitespace-
-- insensitive name. Pending and rejected drafts may collide freely.
--
-- Defensive cleanup: if any duplicates already exist (same normalized name,
-- both approved+active), keep the most recently updated row approved and
-- demote the rest to 'pending'. They remain editable and re-approvable once
-- their names are made unique.
UPDATE stations
SET status = 'pending', updated_at = NOW()
WHERE id IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY lower(btrim(name))
                   ORDER BY updated_at DESC, id
               ) AS rn
        FROM stations
        WHERE status = 'approved' AND is_active = true
    ) ranked
    WHERE rn > 1
);

CREATE UNIQUE INDEX stations_approved_name_idx
    ON stations (lower(btrim(name)))
    WHERE status = 'approved' AND is_active = true;
