#!/usr/bin/env python3

import argparse
import subprocess
from pathlib import Path
import time

script_path = Path(__file__).resolve()
ROOT_DIR = script_path.parent

CLUSTER_NAME = 'testCluster'
HELM_RELEASE_NAME = 'preview'
HELM_CHART_DIR = ROOT_DIR / 'kubernetes' / 'loculus'

WEBSITE_PORT_MAPPING = '-p 3000:30081@agent:0'
BACKEND_PORT_MAPPING = '-p 8079:30082@agent:0'
LAPIS_PORT_MAPPING = '-p 8080:80@loadbalancer'
DATABASE_PORT_MAPPING = '-p 5432:30432@agent:0'
KEYCLOAK_PORT_MAPPING = '-p 8083:30083@agent:0'

PORTS = [WEBSITE_PORT_MAPPING, BACKEND_PORT_MAPPING, LAPIS_PORT_MAPPING, DATABASE_PORT_MAPPING, KEYCLOAK_PORT_MAPPING]

parser = argparse.ArgumentParser(description='Manage k3d cluster and helm installations.')
subparsers = parser.add_subparsers(dest='subcommand', required=True, help='Subcommands')

cluster_parser = subparsers.add_parser('cluster', help='Manage the k3d cluster')
cluster_parser.add_argument('--dev', action='store_true',
                            help='Set up a development environment for running the website and the backend locally')
cluster_parser.add_argument('--delete', action='store_true', help='Delete the cluster')

helm_parser = subparsers.add_parser('helm', help='Manage helm installation')
helm_parser.add_argument('--dev', action='store_true',
                         help='Set up a development environment for running the website and the backend locally')
helm_parser.add_argument('--branch', help='Set the branch to deploy with the Helm chart')
helm_parser.add_argument('--dockerconfigjson', help='Base64 encoded dockerconfigjson secret for pulling the images')
helm_parser.add_argument('--uninstall', action='store_true', help='Uninstall installation')
helm_parser.add_argument('--enablePreprocessing', action='store_true',
                         help='Include deployment of preprocessing pipelines')

upgrade_parser = subparsers.add_parser('upgrade', help='Upgrade helm installation')

args = parser.parse_args()


def main():
    if args.subcommand == 'cluster':
        handle_cluster()
    elif args.subcommand == 'helm':
        handle_helm()
    elif args.subcommand == 'upgrade':
        handle_helm_upgrade()


def handle_cluster():
    if args.dev:
        remove_port(WEBSITE_PORT_MAPPING)
        remove_port(BACKEND_PORT_MAPPING)
    if args.delete:
        print(f"Deleting cluster '{CLUSTER_NAME}'.")
        subprocess.run(['k3d', 'cluster', 'delete', CLUSTER_NAME])
        return

    if cluster_exists(CLUSTER_NAME):
        print(f"Cluster '{CLUSTER_NAME}' already exists.")
    else:
        subprocess.run(f"k3d cluster create {CLUSTER_NAME} {' '.join(PORTS)} --agents 2",
                       shell=True, check=True)

    while not is_traefik_running():
        print("Waiting for Traefik to start...")
        time.sleep(5)
    print("Traefik is running.")


def is_traefik_running(namespace='kube-system', label='app.kubernetes.io/name=traefik'):
    try:
        result = subprocess.run(['kubectl', 'get', 'pods', '-n', namespace, '-l', label],
                                capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Error executing kubectl: {result.stderr}")
            return False

        if 'Running' in result.stdout:
            return True
    except subprocess.SubprocessError as e:
        print(f"Error checking Traefik status: {e}")
    return False


def remove_port(port_mapping):
    global PORTS
    PORTS = [port for port in PORTS if port != port_mapping]


def cluster_exists(cluster_name):
    result = subprocess.run(['k3d', 'cluster', 'list'], capture_output=True, text=True)
    return cluster_name in result.stdout


def handle_helm():
    if args.uninstall:
        subprocess.run(['helm', 'uninstall', HELM_RELEASE_NAME], check=True)
        return

    if args.branch:
        branch = args.branch
    else:
        branch = 'latest'

    docker_config_json = get_docker_config_json()

    parameters = [
        'helm', 'install', HELM_RELEASE_NAME, HELM_CHART_DIR,
        '--set', "environment=local",
        '--set', f"branch={branch}",
        '--set', f"dockerconfigjson={docker_config_json}",
    ]

    if args.dev:
        parameters += ['--set', "disableBackend=true"]
        parameters += ['--set', "disableWebsite=true"]

    if not args.enablePreprocessing:
        parameters += ['--set', "disablePreprocessing=true"]

    subprocess.run(parameters, check=True)


def get_docker_config_json():
    if args.dockerconfigjson:
        return args.dockerconfigjson
    else:
        command = subprocess.run('base64 ~/.docker/config.json', capture_output=True, text=True, shell=True)
        return command.stdout.replace('\n', '')


def handle_helm_upgrade():
    subprocess.run(['helm', 'upgrade', HELM_RELEASE_NAME, HELM_CHART_DIR], check=True)


if __name__ == '__main__':
    main()
