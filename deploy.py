#!/usr/bin/env python

import argparse
import json
import os
import subprocess  # noqa: S404
import sys
import tempfile
import time
from pathlib import Path

# Minimum version of Python required is 3.9 due to type hint usage
if sys.version_info < (3, 9):  # noqa: UP036
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


CLUSTER_NAME = "testCluster"
HELM_RELEASE_NAME = "preview"
HELM_CHART_DIR = ROOT_DIR / "kubernetes" / "loculus"

WEBSITE_PORT_MAPPING = "-p 127.0.0.1:3000:30081@agent:0"
BACKEND_PORT_MAPPING = "-p 127.0.0.1:8079:30082@agent:0"
LAPIS_PORT_MAPPING = "-p 127.0.0.1:8080:80@loadbalancer"
DATABASE_PORT_MAPPING = "-p 127.0.0.1:5432:30432@agent:0"
KEYCLOAK_PORT_MAPPING = "-p 127.0.0.1:8083:30083@agent:0"
S3_PORT_MAPPING = "-p 127.0.0.1:8084:30084@agent:0"

PORTS = [
    WEBSITE_PORT_MAPPING,
    BACKEND_PORT_MAPPING,
    LAPIS_PORT_MAPPING,
    DATABASE_PORT_MAPPING,
    KEYCLOAK_PORT_MAPPING,
    S3_PORT_MAPPING,
]

parser = argparse.ArgumentParser(description="Manage k3d cluster and helm installations.")
subparsers = parser.add_subparsers(dest="subcommand", required=True, help="Subcommands")
parser.add_argument(
    "--dry-run", action="store_true", help="Print commands instead of executing them"
)
parser.add_argument("--verbose", action="store_true", help="Print commands that are executed")
parser.add_argument(
    "--enableEnaSubmission",
    action="store_true",
    help="Include deployment of ENA submission pipelines",
)
cluster_parser = subparsers.add_parser("cluster", help="Start the k3d cluster")
cluster_parser.add_argument(
    "--dev",
    action="store_true",
    help="Set up a development environment for running the website and the backend locally, skip schema validation",
)
cluster_parser.add_argument("--delete", action="store_true", help="Delete the cluster")
cluster_parser.add_argument("--bind-all", action="store_true", help="Bind to all interfaces")

helm_parser = subparsers.add_parser("helm", help="Install the Helm chart to the k3d cluster")
helm_parser.add_argument(
    "--dev",
    action="store_true",
    help="Set up a development environment for running the website and the backend locally",
)
helm_parser.add_argument("--branch", help="Set the branch to deploy with the Helm chart")
helm_parser.add_argument("--sha", help="Set the commit sha to deploy with the Helm chart")
helm_parser.add_argument("--uninstall", action="store_true", help="Uninstall installation")
helm_parser.add_argument(
    "--enablePreprocessing",
    action="store_true",
    help="Include deployment of preprocessing pipelines",
)
helm_parser.add_argument(
    "--enableIngest", action="store_true", help="Include deployment of ingest pipelines"
)

helm_parser.add_argument(
    "--values",
    action="append",
    help="Values file for helm chart (can be specified multiple times)",
)
helm_parser.add_argument(
    "--template",
    help="Just template and print out the YAML produced",
    action="store_true",
)
helm_parser.add_argument(
    "--for-e2e", action="store_true", help="Use the E2E values file, skip schema validation"
)
helm_parser.add_argument(
    "--use-localhost-ip",
    action="store_true",
    help="Use the local IP address instead of 'localhost' in the config files",
)

upgrade_parser = subparsers.add_parser("upgrade", help="Upgrade helm installation")

config_parser = subparsers.add_parser("config", help="Generate config files")

config_parser.add_argument(
    "--from-live",
    action="store_true",
    help="Generate config files to point to the live cluster "
    "so we don't need to run the cluster locally, only the website",
)

config_parser.add_argument(
    "--live-host",
    default="main.loculus.org",
    help="The live server that should be pointed to, if --from-live is set",
)

config_parser.add_argument(
    "--values",
    action="append",
    help="Values file for helm chart (can be specified multiple times)",
)


args = parser.parse_args()


def run_command(command: list[str], **kwargs):
    if args.dry_run or args.verbose:
        if isinstance(command, str):
            print(command)
        else:
            print(" ".join(map(str, command)))
    if args.dry_run:
        return subprocess.CompletedProcess(args=command, returncode=0, stdout="", stderr="")
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
        generate_configs(
            args.from_live,
            args.live_host,
            args.enableEnaSubmission,
            args.values,
        )


def handle_cluster():
    if args.delete:
        print(f"Deleting cluster '{CLUSTER_NAME}'.")
        run_command(["k3d", "cluster", "delete", CLUSTER_NAME])
        return

    port_bindings = PORTS.copy()
    if args.dev:
        port_bindings = [port for port in port_bindings if port != WEBSITE_PORT_MAPPING]
        port_bindings = [port for port in port_bindings if port != BACKEND_PORT_MAPPING]
    if args.bind_all:
        port_bindings = [port.replace("127.0.0.1", "0.0.0.0") for port in port_bindings]  # noqa: S104

    if cluster_exists(CLUSTER_NAME):
        print(f"Cluster '{CLUSTER_NAME}' already exists.")
    else:
        run_command(
            f"k3d cluster create {CLUSTER_NAME} {' '.join(port_bindings)} --agents 1",
            shell=True,
        )
    install_secret_generator()
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


def cluster_exists(cluster_name):
    result = run_command(["k3d", "cluster", "list"], capture_output=True, text=True)
    return cluster_name in result.stdout


def handle_helm():  # noqa: C901
    if args.uninstall:
        run_command(["helm", "uninstall", HELM_RELEASE_NAME])
        return

    branch = args.branch or "latest"

    parameters = [
        "helm",
        "template" if args.template else "install",
        HELM_RELEASE_NAME,
        HELM_CHART_DIR,
    ]

    if args.values:
        for values_file in args.values:
            parameters += ["-f", values_file]

    parameters += [
        "--set",
        "environment=local",
        "--set",
        f"branch={branch}",
    ]

    if args.for_e2e or args.dev:
        parameters += ["-f", HELM_CHART_DIR / "values_e2e_and_dev.yaml"]
        parameters += ["--skip-schema-validation"]
    if args.sha:
        parameters += ["--set", f"sha={args.sha[:7]}"]

    if args.dev:
        parameters += ["--set", "disableBackend=true"]
        parameters += ["--set", "disableWebsite=true"]

    if not args.enablePreprocessing:
        parameters += ["--set", "disablePreprocessing=true"]

    if not args.enableIngest:
        parameters += ["--set", "disableIngest=true"]

    if args.enableEnaSubmission:
        parameters += ["--set", "disableEnaSubmission=false"]

    if args.use_localhost_ip:
        parameters += ["--set", f"localHost={get_local_ip()}"]
    elif get_codespace_name():
        parameters += get_codespace_params(get_codespace_name())

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


def get_local_ip_mac() -> str:
    """Determine the IP address of the current host on macOS using ipconfig."""
    result = subprocess.run(
        ["ipconfig", "getifaddr", "en0"],  # noqa: S607
        capture_output=True,
        text=True,
        check=True,
    )
    ip_address = result.stdout.strip()
    if ip_address:
        return ip_address
    msg = "Could not determine local IP address (no address found)."
    raise RuntimeError(msg)


def get_local_ip_linux() -> str:
    """Determine the IP address of the current host on Linux using hostname -I."""
    result = subprocess.run(
        ["hostname", "-I"],  # noqa: S607
        capture_output=True,
        text=True,
        check=True,
    )
    ip_addresses = result.stdout.strip().split()
    if ip_addresses:
        return ip_addresses[0]
    msg = "Could not determine local IP address (no addresses found)."
    raise RuntimeError(msg)


def get_local_ip() -> str:
    """Determine the IP address of the current host."""
    try:
        if sys.platform == "darwin":
            return get_local_ip_mac()
        return get_local_ip_linux()
    except (subprocess.CalledProcessError, FileNotFoundError, IndexError) as e:
        msg = "Could not determine local IP address (system command failed)."
        raise RuntimeError(msg) from e


def get_codespace_name():
    return os.environ.get("CODESPACE_NAME", None)


def generate_configs(from_live, live_host, enable_ena, values_files=None):
    temp_dir_path = Path(tempfile.mkdtemp())

    print(f"Unprocessed config available in temp dir: {temp_dir_path}")

    helm_chart = str(HELM_CHART_DIR)
    codespace_name = get_codespace_name()

    output_dir = ROOT_DIR / "website" / "tests" / "config"

    backend_config_path = temp_dir_path / "backend_config.json"
    generate_config(
        helm_chart,
        "templates/loculus-backend-config.yaml",
        backend_config_path,
        codespace_name,
        from_live,
        live_host,
        values_files=values_files,
    )

    website_config_path = temp_dir_path / "website_config.json"
    generate_config(
        helm_chart,
        "templates/loculus-website-config.yaml",
        website_config_path,
        codespace_name,
        from_live,
        live_host,
        values_files=values_files,
    )

    runtime_config_path = temp_dir_path / "runtime_config.json"
    generate_config(
        helm_chart,
        "templates/loculus-website-config.yaml",
        runtime_config_path,
        codespace_name,
        from_live,
        live_host,
        values_files=values_files,
    )

    if enable_ena:
        ena_submission_configmap_path = temp_dir_path / "config.yaml"
        ena_submission_configout_path = temp_dir_path / "ena-submission-config.yaml"
        generate_config(
            helm_chart,
            "templates/ena-submission-config.yaml",
            ena_submission_configmap_path,
            codespace_name,
            from_live,
            live_host,
            ena_submission_configout_path,
            values_files=values_files,
            enableEnaSubmission=True,
        )

    ingest_configmap_path = temp_dir_path / "config.yaml"
    ingest_template_path = "templates/ingest-config.yaml"
    ingest_configout_path = temp_dir_path / "ingest-config.yaml"
    generate_config(
        helm_chart,
        ingest_template_path,
        ingest_configmap_path,
        codespace_name,
        from_live,
        live_host,
        ingest_configout_path,
        values_files=values_files,
    )

    prepro_configmap_path = temp_dir_path / "preprocessing-config.yaml"
    prepro_template_path = "templates/loculus-preprocessing-config.yaml"
    prepro_configout_path = temp_dir_path / "preprocessing-config.yaml"
    generate_config(
        helm_chart,
        prepro_template_path,
        prepro_configmap_path,
        codespace_name,
        from_live,
        live_host,
        prepro_configout_path,
        values_files=values_files,
    )

    run_command(
        [
            "python",
            "kubernetes/config-processor/config-processor.py",
            temp_dir_path,
            output_dir,
        ]
    )
    print(f"Config generation succeeded, processed config files available in {output_dir}")


def generate_config(
    helm_chart,
    template,
    configmap_path,
    codespace_name=None,
    from_live=False,
    live_host=None,
    output_path=None,
    values_files=None,
    enableEnaSubmission=False,
):
    if from_live and live_host:
        number_of_dots = live_host.count(".")
        if number_of_dots < 2:  # this is an imperfect hack
            raise ValueError("Currently only subdomains are supported as live-hosts")
            # To be able to cope with top level domains we need more logic to use the right subdomain separator - but we should probably avoid this anyway as we shouldn't use production domains
    helm_template_cmd = [
        "helm",
        "template",
        "name-does-not-matter",
        helm_chart,
        "--show-only",
        template,
    ]

    if values_files:
        for values_file in values_files:
            helm_template_cmd.extend(["-f", values_file])

    helm_template_cmd.append("--skip-schema-validation")

    if not output_path:
        output_path = configmap_path

    if codespace_name:
        helm_template_cmd.extend(get_codespace_params(codespace_name))

    helm_template_cmd.extend(["--set", "disableWebsite=true"])
    helm_template_cmd.extend(["--set", "disableBackend=true"])
    if from_live:
        helm_template_cmd.extend(["--set", "environment=server"])
        helm_template_cmd.extend(["--set", f"host={live_host}"])
        helm_template_cmd.extend(["--set", "usePublicRuntimeConfigAsServerSide=true"])
    else:
        helm_template_cmd.extend(["--set", "environment=local"])
        helm_template_cmd.extend(["--set", "testconfig=true"])
    if enableEnaSubmission:
        helm_template_cmd.extend(["--set", "disableEnaSubmission=false"])
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
            with open(output_path.with_suffix(f".{config_data['organism']}.yaml"), "w") as f:
                yaml.dump(config_data, f)
                print(f"Wrote config to {f.name}")


def get_codespace_params(codespace_name):
    public_runtime_config = {
        "websiteUrl": f"https://{codespace_name}-3000.app.github.dev",
        "backendUrl": f"https://{codespace_name}-8079.app.github.dev",
        "lapisUrlTemplate": f"https://{codespace_name}-8080.app.github.dev/%organism%",
        "keycloakUrl": f"https://{codespace_name}-8083.app.github.dev",
    }
    return [
        "--set-json",
        f"public={json.dumps(public_runtime_config)}",
    ]


def install_secret_generator():
    add_helm_repo_command = [
        "helm",
        "repo",
        "add",
        "mittwald",
        "https://helm.mittwald.de",
    ]

    # Retry logic for helm repo add with exponential backoff
    max_retries = 5
    retry_delay = 5
    for attempt in range(max_retries + 1):
        try:
            run_command(add_helm_repo_command)
            print("Mittwald repository added to Helm.")
            break
        except subprocess.SubprocessError as e:
            if attempt < max_retries:
                print(f"Failed to add Mittwald repository (attempt {attempt + 1}/{max_retries + 1}). Retrying in {retry_delay} seconds...")
                time.sleep(retry_delay)
                retry_delay = min(retry_delay * 2, 60)
            else:
                print(f"Failed to add Mittwald repository after {max_retries + 1} attempts.")
                raise e

    update_helm_repo_command = ["helm", "repo", "update"]
    run_command(update_helm_repo_command)
    print("Helm repositories updated.")

    secret_generator_chart = "mittwald/kubernetes-secret-generator"  # noqa: S105
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


if __name__ == "__main__":
    main()
