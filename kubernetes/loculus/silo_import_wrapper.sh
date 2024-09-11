#!/bin/bash

lastSnapshot=0
while true
do
    lastSnapshot=$(bash /silo_import_job.sh --lastSnapshot=$lastSnapshot)
    sleep 30
done
