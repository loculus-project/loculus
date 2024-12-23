#!/usr/bin/env bash

wget https://download.geonames.org/export/dump/allCountries.zip -O results/allCountries.zip
unzip -o results/allCountries.zip -d results
rm results/allCountries.zip
tsv-filter --str-eq 7:A results/allCountries.txt > results/adm.tsv
sync && rm results/allCountries.txt
tsv-select -f 1-3,5-6,8-13 results/adm.tsv > uploads/input.tsv
rm results/adm.tsv