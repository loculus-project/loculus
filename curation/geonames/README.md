### GeoNames

We use [GeoNames](https://download.geonames.org/export/) for an official list of admin divisions for each country. GeoNames is an open source, curated list of geographic features, including administrative divisions. For each division GeoNames has its own official geonameid but also typically maps each division to its official ISO and FIPS code. Additionally, GeoNames curates lists of known alternative names of each division, including multi-lingual division names.

For countries the standard categories are defined by ISO-3166-1, administrative
divisions of a country can then be classified using ISO-3166-2. Subdivisions do not exist for all countries and the hierarchy between the subdivision levels is not immediately clear from the codes. Alternatively, FIPS is a US-government maintained list of country and administrative division codes. Although FIPS codes are often not compatible with ISO codes they typically do map to the same divisions, and FIPS typically has a clear hierarchy.

When downloading from GeoNames their data is available in one condensed 'geoname' table with the following fields. As of May 16th 2025 all ADMIN2 divisions have a corresponding ADMIN1 division except for the Admin2 division `Chongqing` in China.


| geonameid         | integer id of record in geonames database | 
--------------------| ------------------------------|
| name              | name of geographical point (utf8) varchar(200) | 
| asciiname         | name of geographical point in plain ascii characters, varchar(200)| 
| alternatenames    | alternatenames, comma separated, ascii names automatically transliterated, convenience attribute from 
| alternatename table, varchar(10000)| 
| latitude          | latitude in decimal degrees (wgs84)| 
| longitude         | longitude in decimal degrees (wgs84)| 
| feature class     | see http://www.geonames.org/export/codes.html, char(1)| 
| feature code      | see http://www.geonames.org/export/codes.html, varchar(10)| 
| country code      | ISO-3166 2-letter country code, 2 characters| 
| cc2               | alternate country codes, comma separated, ISO-3166 2-letter country code, 200 characters| 
| admin1 code       | fipscode (subject to change to iso code), see exceptions below, see file admin1Codes.txt for display names of this code; varchar(20)| 
| admin2 code       | code for the second administrative division, a county in the US, see file admin2Codes.txt; varchar(80) | 
| admin3 code       | code for third level administrative division, varchar(20)| 
| admin4 code       | code for fourth level administrative division, varchar(20)| 
| population        | bigint (8 byte int) | 
| elevation         | in meters, integer| 
| dem               | digital elevation model, srtm3 or gtopo30, average elevation of 3''x3'' (ca 90mx90m) or 30''x30'' (ca 900mx900m) area in meters, integer. srtm processed by cgiar/ciat.| 
| timezone          | the iana timezone id (see file timeZone.txt) varchar(40)| 
| modification date | date of last modification in yyyy-MM-dd format| 
