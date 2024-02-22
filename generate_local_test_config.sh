#!/bin/bash

set -e

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

"$root/deploy.py" config
