	-- SELECT tablename FROM pg_catalog.pg_tables
	-- WHERE schemaname = 'public';

-- CREATE TABLE vereine (
--     id SERIAL PRIMARY KEY,
--     vereinsname TEXT NOT NULL
-- );

-- CREATE TABLE spiele (
--    id SERIAL PRIMARY KEY,
-- anstoss TIMESTAMP WITH TIME ZONE NOT NULL,
--    heimverein TEXT NOT NULL,
--    gastverein TEXT NOT NULL,
--    heimtore INTEGER ,
--    gasttore INTEGER ,
--    statuswort TEXT NOT NULL
-- );



-- CREATE TABLE users(
-- Id serial primary key,
-- name TEXT NOT NULL,
-- password TEXT NOT NULL,
-- role TEXT NOT NULL
-- );

-- -- für admin Änderung:
-- ALTER TABLE users
-- ADD CONSTRAINT users_name_unique UNIQUE (name);


-- CREATE TABLE tips (
--     id SERIAL PRIMARY KEY,
--     user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
--     spiel_id INT NOT NULL REFERENCES spiele(id) ON DELETE CASCADE,
--     heimtipp INT NOT NULL,
--     gasttipp INT NOT NULL,
--     punkte INT DEFAULT 0,
--     created_at TIMESTAMP DEFAULT NOW(),
--     updated_at TIMESTAMP DEFAULT NOW(),
--     UNIQUE (user_id, spiel_id)
-- );------------------------------------------

-- ALTER TABLE tips
-- ADD CONSTRAINT unique_user_spiel
-- UNIQUE (user_id, spiel_id);

-- später für Vereine und Zeiten:

-- ALTER TABLE  vereine
-- ADD COLUMN url TEXT;

-- ALTER TABLE spiele
-- ADD COLUMN heimbild TEXT;
-- ADD COLUMN gastbild TEXT;

