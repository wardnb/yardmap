-- Add new zone types
ALTER TABLE zones DROP CONSTRAINT IF EXISTS zones_type_check;
ALTER TABLE zones ADD CONSTRAINT zones_type_check CHECK (
  type IN ('lawn','garden_bed','tree','hardscape','irrigation','fence','driveway','vegetable','path','structure','other')
);
