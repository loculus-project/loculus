#!/usr/bin/env python3

import argparse
import os
import subprocess
import time
from pathlib import Path

import yaml

script_path = Path(__file__).resolve()
ROOT_DIR = script_path.parent
TEMP_DIR = ROOT_DIR / 'temp'


CLUSTER_NAME = 'testCluster'
HELM_RELEASE_NAME = 'preview'
HELM_CHART_DIR = ROOT_DIR / 'kubernetes' / 'loculus'
HELM_VALUES_FILE = HELM_CHART_DIR / 'values.yaml'

WEBSITE_PORT_MAPPING = '-p 3000:30081@agent:0'
BACKEND_PORT_MAPPING = '-p 8079:30082@agent:0'
LAPIS_PORT_MAPPING = '-p 8080:80@loadbalancer'
DATABASE_PORT_MAPPING = '-p 5432:30432@agent:0'
KEYCLOAK_PORT_MAPPING = '-p 8083:30083@agent:0'

PORTS = [WEBSITE_PORT_MAPPING, BACKEND_PORT_MAPPING, LAPIS_PORT_MAPPING, DATABASE_PORT_MAPPING, KEYCLOAK_PORT_MAPPING]

parser = argparse.ArgumentParser(description='Manage k3d cluster and helm installations.')
subparsers = parser.add_subparsers(dest='subcommand', required=True, help='Subcommands')
parser.add_argument('--dry-run', action='store_true', help='Print commands instead of executing them')

cluster_parser = subparsers.add_parser('cluster', help='Start the k3d cluster')
cluster_parser.add_argument('--dev', action='store_true',
                            help='Set up a development environment for running the website and the backend locally')
cluster_parser.add_argument('--delete', action='store_true', help='Delete the cluster')

helm_parser = subparsers.add_parser('helm', help='Install the Helm chart to the k3d cluster')
helm_parser.add_argument('--dev', action='store_true',
                         help='Set up a development environment for running the website and the backend locally')
helm_parser.add_argument('--branch', help='Set the branch to deploy with the Helm chart')
helm_parser.add_argument('--sha', help='Set the commit sha to deploy with the Helm chart')
helm_parser.add_argument('--dockerconfigjson',
                         help='Set the base64 encoded dockerconfigjson secret for pulling the images')
helm_parser.add_argument('--uninstall', action='store_true', help='Uninstall installation')
helm_parser.add_argument('--enablePreprocessing', action='store_true',
                         help='Include deployment of preprocessing pipelines')
helm_parser.add_argument('--values', help='Values file for helm chart',
                         default=HELM_VALUES_FILE)

upgrade_parser = subparsers.add_parser('upgrade', help='Upgrade helm installation')

config_parser = subparsers.add_parser('config', help='Generate config files')

args = parser.parse_args()

def run_command(command: list[str], **kwargs):
    if args.dry_run:
        if isinstance(command, str):
            print(command)
        else:
            print(" ".join(map(str,command)))
        return subprocess.CompletedProcess(args=command, returncode=0, stdout="", stderr="")
    else:
        return subprocess.run(command, **kwargs)


def main():
    if args.subcommand == 'cluster':
        handle_cluster()
    elif args.subcommand == 'helm':
        handle_helm()
    elif args.subcommand == 'upgrade':
        handle_helm_upgrade()
    elif args.subcommand == 'config':
        generate_configs()


def handle_cluster():
    if args.dev:
        remove_port(WEBSITE_PORT_MAPPING)
        remove_port(BACKEND_PORT_MAPPING)
    if args.delete:
        print(f"Deleting cluster '{CLUSTER_NAME}'.")
        run_command(['k3d', 'cluster', 'delete', CLUSTER_NAME])
        return

    if cluster_exists(CLUSTER_NAME):
        print(f"Cluster '{CLUSTER_NAME}' already exists.")
    else:
        run_command(f"k3d cluster create {CLUSTER_NAME} {' '.join(PORTS)} --agents 2",
                       shell=True, check=True)

    while not is_traefik_running():
        print("Waiting for Traefik to start...")
        time.sleep(5)
    print("Traefik is running.")


def is_traefik_running(namespace='kube-system', label='app.kubernetes.io/name=traefik'):
    try:
        result = run_command(['kubectl', 'get', 'pods', '-n', namespace, '-l', label],
                                capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Error executing kubectl: {result.stderr}")
            return False

        if 'Running' in result.stdout or args.dry_run:
            return True
    except subprocess.SubprocessError as e:
        print(f"Error checking Traefik status: {e}")
    return False


def remove_port(port_mapping):
    global PORTS
    PORTS = [port for port in PORTS if port != port_mapping]


def cluster_exists(cluster_name):
    result = run_command(['k3d', 'cluster', 'list'], capture_output=True, text=True)
    return cluster_name in result.stdout


def handle_helm():
    if args.uninstall:
        run_command(['helm', 'uninstall', HELM_RELEASE_NAME], check=True)

        return

    if args.branch:
        branch = args.branch
    else:
        branch = 'latest'

    docker_config_json = get_docker_config_json()

    parameters = [
        'helm', 'install', HELM_RELEASE_NAME, HELM_CHART_DIR,
        '-f', args.values,
        '--set', "environment=local",
        '--set', f"branch={branch}",
        '--set', f"dockerconfigjson={docker_config_json}",
    ]

    if args.sha:
        parameters += ['--set', f"sha={args.sha[:7]}"]

    if args.dev:
        parameters += ['--set', "disableBackend=true"]
        parameters += ['--set', "disableWebsite=true"]

    if not args.enablePreprocessing:
        parameters += ['--set', "disablePreprocessing=true"]
    
    if get_codespace_name():
        parameters += ['--set', "codespaceName="+get_codespace_name()]

    run_command(parameters, check=True)


def get_docker_config_json():
    if args.dockerconfigjson:
        return args.dockerconfigjson
    else:
        command = run_command('base64 ~/.docker/config.json', capture_output=True, text=True, shell=True)
        return command.stdout.replace('\n', '')


def handle_helm_upgrade():
    parameters = [
        'helm', 'upgrade', HELM_RELEASE_NAME, HELM_CHART_DIR,
    ]
    run_command(parameters, check=True)

def get_codespace_name():
    return os.environ.get('CODESPACE_NAME', None)

def generate_configs():
    TEMP_DIR.mkdir(parents=True, exist_ok=True)

    helm_chart = str(HELM_CHART_DIR)
    codespace_name = get_codespace_name()

    output_dir = ROOT_DIR / 'website' / 'tests' / 'config' 

    backend_config_path = TEMP_DIR / 'backend_config.json'
    generate_config(helm_chart, 'templates/loculus-backend-config.yaml', backend_config_path, codespace_name)

    website_config_path = TEMP_DIR / 'website_config.json'
    generate_config(helm_chart, 'templates/loculus-website-config.yaml', website_config_path, codespace_name)

    runtime_config_path =  TEMP_DIR / 'runtime_config.json'
    generate_config(helm_chart, 'templates/loculus-website-config.yaml', runtime_config_path, codespace_name)

    run_command(['python3', 'kubernetes/config-processor/config-processor.py', TEMP_DIR, output_dir], check=True)

def generate_config(helm_chart, template, output_path, codespace_name=None):
    helm_template_cmd = ['helm', 'template', 'name-does-not-matter', helm_chart, '--show-only', template]

    if codespace_name:
        helm_template_cmd.extend(['--set', 'codespaceName='+codespace_name])

    helm_template_cmd.extend(['--set', 'environment=local'])
    helm_template_cmd.extend(['--set', 'disableWebsite=true'])
    helm_template_cmd.extend(['--set', 'disableBackend=true'])
    helm_output = run_command(helm_template_cmd, capture_output=True, text=True, check=True).stdout
    if args.dry_run:
        return

    parsed_yaml = yaml.safe_load(helm_output)
    config_data = parsed_yaml['data'][output_path.name]

    with open(output_path, 'w') as f:
        f.write(config_data)

    print(f"Wrote config to {output_path}")

if __name__ == '__main__':
    main()
