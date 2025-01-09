#!/bin/bash


if [ -z "$ENA_PASSWORD" ]; then
  echo "ENA_PASSWORD is not set. Please set it and try again."
fi

if [ -z "$ENA_USERNAME" ]; then
  echo "ENA_USERNAME is not set. Please set it and try again."
fi

creds="$ENA_USERNAME:$ENA_PASSWORD"


submission_dir="curations"

#need a plain file to write and read the bearer key from, see later in this script. It will be automatically created with the name below
export bearer_file="bearer_file"

# set up the applicable server URL for the the test or production environment.
# it is by default set up to submit to the test=developmental server.
TEST=1
if [ $TEST -eq 1 ]; then
  echo "using test credentials and setup"
  url="https://wwwdev.ebi.ac.uk/ena/clearinghouse/api/curations"
  auth_url='https://explore.api.aai.ebi.ac.uk/auth'
else
  #PROD
  echo "using production credentials and setup"
  url="https://www.ebi.ac.uk/ena/clearinghouse/api/curations"
  auth_url='https://api.aai.ebi.ac.uk/auth'
fi

################################################################
# Declaring Functions, that are called later in this bash script

function create_bearer_file () {
  auth_url=$1
  credentials=$2
  echo "curl $auth_url" -u "$credentials"
  echo $bearer_file
  curl "$auth_url" -u "$credentials" 1> $bearer_file 2>/dev/null
  bearerkey=$(cat $bearer_file)
  len=${#bearerkey}
  if [ $len -lt 100 ]; then
    echo "Invalid bearer key, so exiting script, try later."
    exit
  fi
  }

function submit_2_clearinghouse () {
  export curation_json_file=$1
  echo $curation_json_file
  export bearerkey=$(cat $bearer_file)
  export bearer="Authorization: Bearer $bearerkey"
  #echo $bearer
  # -T is needed for big files -d @ is slightly faster and puts it into memory
  cmd=$(curl -X POST \"${url}\" -H \"accept: */*\"  -H \"Content-Type: application/json\"   -H \"${bearer}\"  -d @${curation_json_file})
  #could not get to both see the command and execute it, so doing the dirty way via a new file
  echo $cmd
  echo $cmd > run_me.sh
  time sh ./run_me.sh
  echo " "
}

if [ ! -d $submission_dir ]; then
    echo "${submission_dir}<--is not a valid directory, so exiting"
    exit
fi
echo "submission_dir: -->"${submission_dir}

##################################################################################################
# now processing every json file in your submission directory
for file in $submission_dir/*.json
do
    echo $file
    create_bearer_file $auth_url $creds
    submit_2_clearinghouse $file
    sleep 0.1 # wait 0.1 seconds
done