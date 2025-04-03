CREATE TABLE IF NOT EXISTS administrative_regions (
    geonameid         INTEGER PRIMARY KEY AUTOINCREMENT,
    name              VARCHAR(200) NOT NULL,
    asciiname         VARCHAR(200) NOT NULL,
    latitude          DECIMAL(9, 6) NOT NULL,
    longitude         DECIMAL(9, 6) NOT NULL,
    feature_code      VARCHAR(10),
    country_code      CHAR(2),
    cc2               VARCHAR(200),
    admin1_code       VARCHAR(20),
    admin2_code       VARCHAR(80),
    admin3_code       VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS alternatenames (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    geonameid       INTEGER REFERENCES geoname(geonameid) ON DELETE CASCADE,
    alternatename   VARCHAR(200)
);