#!/usr/bin/env python3

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

# Minimum version of Python required is 3.9 due to type hint usage
if sys.version_info < (3, 9):
    msg = f"Python 3.9 or higher is required to run the ./deploy.py script\nYou are using version {sys.version} from {sys.executable}"
    raise RuntimeError(msg)

try:
    import yaml
except ImportError as e:
    msg = (
        f"pyyaml is not installed but required by ./deploy.py\n"
        "You can install it for example with 'pip install pyyaml' or 'conda install pyyaml' (if using conda)\n"
        f"You are currently using Python version {sys.version} from {sys.executable}"
    )
    raise ImportError(msg) from e

script_path = Path(__file__).resolve()
ROOT_DIR = script_path.parent
TEMP_DIR = ROOT_DIR / "temp"


CLUSTER_NAME = "testCluster"
HELM_RELEASE_NAME = "preview"
HELM_CHART_DIR = ROOT_DIR / "kubernetes" / "loculus"
HELM_VALUES_FILE = HELM_CHART_DIR / "values.yaml"

WEBSITE_PORT_MAPPING = "-p 127.0.0.1:3000:30081@agent:0"
BACKEND_PORT_MAPPING = "-p 127.0.0.1:8079:30082@agent:0"
LAPIS_PORT_MAPPING = "-p 127.0.0.1:8080:80@loadbalancer"
DATABASE_PORT_MAPPING = "-p 127.0.0.1:5432:30432@agent:0"
KEYCLOAK_PORT_MAPPING = "-p 127.0.0.1:8083:30083@agent:0"

PORTS = [
    WEBSITE_PORT_MAPPING,
    BACKEND_PORT_MAPPING,
    LAPIS_PORT_MAPPING,
    DATABASE_PORT_MAPPING,
    KEYCLOAK_PORT_MAPPING,
]

parser = argparse.ArgumentParser(
    description="Manage k3d cluster and helm installations."
)
subparsers = parser.add_subparsers(dest="subcommand", required=True, help="Subcommands")
parser.add_argument(
    "--dry-run", action="store_true", help="Print commands instead of executing them"
)
parser.add_argument(
    "--verbose", action="store_true", help="Print commands that are executed"
)

cluster_parser = subparsers.add_parser("cluster", help="Start the k3d cluster")
cluster_parser.add_argument(
    "--dev",
    action="store_true",
    help="Set up a development environment for running the website and the backend locally",
)
cluster_parser.add_argument("--delete", action="store_true", help="Delete the cluster")

helm_parser = subparsers.add_parser(
    "helm", help="Install the Helm chart to the k3d cluster"
)
helm_parser.add_argument(
    "--dev",
    action="store_true",
    help="Set up a development environment for running the website and the backend locally",
)
helm_parser.add_argument(
    "--branch", help="Set the branch to deploy with the Helm chart"
)
helm_parser.add_argument(
    "--sha", help="Set the commit sha to deploy with the Helm chart"
)
helm_parser.add_argument(
    "--uninstall", action="store_true", help="Uninstall installation"
)
helm_parser.add_argument(
    "--enablePreprocessing",
    action="store_true",
    help="Include deployment of preprocessing pipelines",
)
helm_parser.add_argument(
    "--enableIngest", action="store_true", help="Include deployment of ingest pipelines"
)
helm_parser.add_argument(
    "--enableEnaSubmission",
    action="store_true",
    help="Include deployment of ena submission pipelines",
)
helm_parser.add_argument(
    "--values", help="Values file for helm chart", default=HELM_VALUES_FILE
)
helm_parser.add_argument(
    "--template",
    help="Just template and print out the YAML produced",
    action="store_true",
)
helm_parser.add_argument(
    "--for-e2e", action="store_true", help="Use the E2E values file"
)

upgrade_parser = subparsers.add_parser("upgrade", help="Upgrade helm installation")

config_parser = subparsers.add_parser("config", help="Generate config files")

config_parser.add_argument(
    "--from-live",
    action="store_true",
    help="Generate config files to point to the live cluster so we don`t need to run the cluster locally, only the website",
)

args = parser.parse_args()


def run_command(command: list[str], **kwargs):
    if args.dry_run or args.verbose:
        if isinstance(command, str):
            print(command)
        else:
            print(" ".join(map(str, command)))
    if args.dry_run:
        return subprocess.CompletedProcess(
            args=command, returncode=0, stdout="", stderr=""
        )
    else:
        output = subprocess.run(command, **kwargs)
        if output.returncode != 0:
            raise subprocess.SubprocessError(output.stderr)
        return output


def main():
    if args.subcommand == "cluster":
        handle_cluster()
    elif args.subcommand == "helm":
        handle_helm()
    elif args.subcommand == "upgrade":
        handle_helm_upgrade()
    elif args.subcommand == "config":
        generate_configs(args.from_live)


def handle_cluster():
    if args.dev:
        remove_port(WEBSITE_PORT_MAPPING)
        remove_port(BACKEND_PORT_MAPPING)
    if args.delete:
        print(f"Deleting cluster '{CLUSTER_NAME}'.")
        run_command(["k3d", "cluster", "delete", CLUSTER_NAME])
        return

    if cluster_exists(CLUSTER_NAME):
        print(f"Cluster '{CLUSTER_NAME}' already exists.")
    else:
        run_command(
            f"k3d cluster create {CLUSTER_NAME} {' '.join(PORTS)} --agents 1",
            shell=True,
        )
    install_secret_generator()
    install_reloader()
    while not is_traefik_running():
        print("Waiting for Traefik to start...")
        time.sleep(5)
    print("Traefik is running.")


def is_traefik_running(namespace="kube-system", label="app.kubernetes.io/name=traefik"):
    try:
        result = run_command(
            ["kubectl", "get", "pods", "-n", namespace, "-l", label],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            print(f"Error executing kubectl: {result.stderr}")
            return False

        if "Running" in result.stdout or args.dry_run:
            return True
    except subprocess.SubprocessError as e:
        print(f"Error checking Traefik status: {e}")
    return False


def remove_port(port_mapping):
    global PORTS
    PORTS = [port for port in PORTS if port != port_mapping]


def cluster_exists(cluster_name):
    result = run_command(["k3d", "cluster", "list"], capture_output=True, text=True)
    return cluster_name in result.stdout


def handle_helm():
    if args.uninstall:
        run_command(["helm", "uninstall", HELM_RELEASE_NAME])

        return

    if args.branch:
        branch = args.branch
    else:
        branch = "latest"

    parameters = [
        "helm",
        "template" if args.template else "install",
        HELM_RELEASE_NAME,
        HELM_CHART_DIR,
        "-f",
        args.values,
        "--set",
        "environment=local",
        "--set",
        f"branch={branch}",
    ]

    if args.for_e2e or args.dev:
        parameters += ["-f", HELM_CHART_DIR / "values_e2e_and_dev.yaml"]
    if args.sha:
        parameters += ["--set", f"sha={args.sha[:7]}"]

    if args.dev:
        parameters += ["--set", "disableBackend=true"]
        parameters += ["--set", "disableWebsite=true"]

    if not args.enablePreprocessing:
        parameters += ["--set", "disablePreprocessing=true"]

    if not args.enableIngest:
        parameters += ["--set", "disableIngest=true"]

    if not args.enableEnaSubmission:
        parameters += ["--set", "disableEnaSubmission=true"]

    if get_codespace_name():
        parameters += ["--set", "codespaceName=" + get_codespace_name()]

    output = run_command(parameters)
    if args.template:
        print(output.stdout)


def handle_helm_upgrade():
    parameters = [
        "helm",
        "upgrade",
        HELM_RELEASE_NAME,
        HELM_CHART_DIR,
    ]
    run_command(parameters)


def get_codespace_name():
    return os.environ.get("CODESPACE_NAME", None)


def generate_configs(from_live=False):
    TEMP_DIR.mkdir(parents=True, exist_ok=True)

    # Delete all files in the temp directory
    for file in TEMP_DIR.iterdir():
        file.unlink()

    helm_chart = str(HELM_CHART_DIR)
    codespace_name = get_codespace_name()

    output_dir = ROOT_DIR / "website" / "tests" / "config"

    backend_config_path = TEMP_DIR / "backend_config.json"
    generate_config(
        helm_chart,
        "templates/loculus-backend-config.yaml",
        backend_config_path,
        codespace_name,
        from_live,
    )

    website_config_path = TEMP_DIR / "website_config.json"
    generate_config(
        helm_chart,
        "templates/loculus-website-config.yaml",
        website_config_path,
        codespace_name,
        from_live,
    )

    runtime_config_path = TEMP_DIR / "runtime_config.json"
    generate_config(
        helm_chart,
        "templates/loculus-website-config.yaml",
        runtime_config_path,
        codespace_name,
        from_live,
    )

    ingest_configmap_path = TEMP_DIR / "config.yaml"
    ingest_template_path = "templates/ingest-config.yaml"
    ingest_configout_path = TEMP_DIR / "ingest-config.yaml"
    generate_config(
        helm_chart,
        ingest_template_path,
        ingest_configmap_path,
        codespace_name,
        from_live,
        ingest_configout_path,
    )
    
    prepro_configmap_path = TEMP_DIR / "preprocessing-config.yaml"
    prepro_template_path = "templates/loculus-preprocessing-config.yaml"
    prepro_configout_path = TEMP_DIR / "preprocessing-config.yaml"
    generate_config(
        helm_chart,
        prepro_template_path,
        prepro_configmap_path,
        codespace_name,
        from_live,
        prepro_configout_path,
    )

    run_command(
        [
            "python3",
            "kubernetes/config-processor/config-processor.py",
            TEMP_DIR,
            output_dir,
        ]
    )


def generate_config(
    helm_chart,
    template,
    configmap_path,
    codespace_name=None,
    from_live=False,
    output_path=None,
):
    helm_template_cmd = [
        "helm",
        "template",
        "name-does-not-matter",
        helm_chart,
        "--show-only",
        template,
    ]

    if not output_path:
        output_path = configmap_path

    if codespace_name:
        helm_template_cmd.extend(["--set", "codespaceName=" + codespace_name])

    helm_template_cmd.extend(["--set", "disableWebsite=true"])
    helm_template_cmd.extend(["--set", "disableBackend=true"])
    if from_live:
        helm_template_cmd.extend(["--set", "environment=server"])
        helm_template_cmd.extend(["--set", "host=main.loculus.org"])
        helm_template_cmd.extend(["--set", "usePublicRuntimeConfigAsServerSide=true"])
    else:
        helm_template_cmd.extend(["--set", "environment=local"])
        helm_template_cmd.extend(["--set", "testconfig=true"])
    helm_output = run_command(helm_template_cmd, capture_output=True, text=True).stdout
    if args.dry_run:
        return

    parsed_yaml = list(yaml.full_load_all(helm_output))
    if len(parsed_yaml) == 1:
        config_data = parsed_yaml[0]["data"][configmap_path.name]

        with open(output_path, "w") as f:
            f.write(config_data)

        print(f"Wrote config to {output_path}")
    elif any(substring in template for substring in ["ingest", "preprocessing"]):
        for doc in parsed_yaml:
            config_data = yaml.safe_load(doc["data"][configmap_path.name])
            with open(
                output_path.with_suffix(f'.{config_data["organism"]}.yaml'), "w"
            ) as f:
                yaml.dump(config_data, f)
                print(f"Wrote config to {f.name}")


def install_secret_generator():
    add_helm_repo_command = [
        "helm",
        "repo",
        "add",
        "mittwald",
        "https://helm.mittwald.de",
    ]
    run_command(add_helm_repo_command)
    print("Mittwald repository added to Helm.")

    update_helm_repo_command = ["helm", "repo", "update"]
    run_command(update_helm_repo_command)
    print("Helm repositories updated.")

    secret_generator_chart = "mittwald/kubernetes-secret-generator"
    print("Installing Kubernetes Secret Generator...")
    helm_install_command = [
        "helm",
        "upgrade",
        "--install",
        "kubernetes-secret-generator",
        secret_generator_chart,
        "--set",
        "secretLength=32",
        "--set",
        'watchNamespace=""',
        "--set",
        "resources.limits.memory=400Mi",
        "--set",
        "resources.requests.memory=200Mi",
    ]
    run_command(helm_install_command)


def install_reloader():
    add_helm_repo_command = [
        "helm",
        "repo",
        "add",
        "stakater",
        "https://stakater.github.io/stakater-charts",
    ]
    run_command(add_helm_repo_command)
    print("Stakater added to repositories.")

    update_helm_repo_command = ["helm", "repo", "update"]
    run_command(update_helm_repo_command)
    print("Helm repositories updated.")

    secret_generator_chart = "stakater/reloader"
    print("Installing Reloader...")
    helm_install_command = [
        "helm",
        "upgrade",
        "--install",
        "reloader",
        secret_generator_chart,
        "--set",
        "reloader.deployment.resources.limits.memory=200Mi",
        "--set",
        "reloader.deployment.resources.requests.memory=100Mi",
    ]
    run_command(helm_install_command)


if __name__ == "__main__":
    main()
