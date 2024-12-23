## Geonames API

This is a simple flask API with a local SQLlite database server and swagger API, the API can be run locally using 

```
python api.py
```

initially the database will be empty but Geonames offers a free download service with all administrative regions: https://download.geonames.org/export/dump/, see local development for details.

### Local Development

[Dbeaver](https://dbeaver.io/) is great interface for SQLlite - enter the path to `geonames_database.db` to view the local database.

Run the following commands to download all administrative regions from Geonames and upload to the SQLlite db. 

```
wget https://download.geonames.org/export/dump/allCountries.zip -O results/allCountries.zip
unzip results/allCountries.zip
tsv-filter --str-eq 7:A results/allCountries.txt > results/adm.tsv
tsv-select -f 1-3,5-6,8-13 results/adm.tsv > results/adm_dropped.tsv 
curl -X POST -F "file=@results/adm_dropped.tsv" http://127.0.0.1:5000/upload/upload-tsv
```