## Send curations to the ENA Clearing House

This folder includes a bash script for submitting curations to the [ENA Clearing House](https://ena-docs.readthedocs.io/en/latest/submit/annotation/clearinghouse_for_ENA_users.html). It relies on the template [here](https://ena-docs.readthedocs.io/en/latest/submit/annotation/clearinghouse_submission_template.html).


To use it add your curations in json format to the `curation` folder and run:
```
ENA_USERNAME={username} ENA_PASSWORD={password} ./send_curations_to_ena.sh
```