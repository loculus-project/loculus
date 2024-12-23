#!/usr/bin/env bash

curl -I https://download.geonames.org/export/dump/allCountries.zip > results/allCountries.zip
unzip -o results/allCountries.zip -d results
tsv-filter --str-eq 7:A results/allCountries.txt > results/adm.tsv
tsv-select -f 1-3,5-6,8-13 results/adm.tsv > uploads/input.tsv