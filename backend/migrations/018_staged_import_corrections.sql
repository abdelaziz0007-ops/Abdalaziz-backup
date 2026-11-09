DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mizan_api_v1') THEN
  GRANT SELECT,INSERT ON mizan.row_transformations TO mizan_api_v1;
 END IF;
END $$;
