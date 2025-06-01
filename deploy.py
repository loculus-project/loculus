#!/usr/bin/env python

import argparse
import json
import os
import subprocess
import sys
import tempfile
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


CLUSTER_NAME = "testCluster"
HELM_RELEASE_NAME = "preview"
HELM_CHART_DIR = ROOT_DIR / "kubernetes" / "loculus"
HELM_VALUES_FILE = HELM_CHART_DIR / "values.yaml"

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

helm_parser.add_argument("--values", help="Values file for helm chart", default=HELM_VALUES_FILE)
helm_parser.add_argument(
    "--template",
    help="Just template and print out the YAML produced",
    action="store_true",
)
helm_parser.add_argument("--for-e2e", action="store_true", help="Use the E2E values file, skip schema validation")

upgrade_parser = subparsers.add_parser("upgrade", help="Upgrade helm installation")

config_parser = subparsers.add_parser("config", help="Generate config files")

config_parser.add_argument(
    "--from-live",
    action="store_true",
    help="Generate config files to point to the live cluster so we don`t need to run the cluster locally, only the website",
)

config_parser.add_argument(
    "--live-host",
    default="main.loculus.org",
    help="The live server that should be pointed to, if --from-live is set",
)

config_parser.add_argument(
    "--custom-values",
    help="Custom values file for helm chart"
)


args = parser.parse_args()


def run_command(command: list[str] | str, **kwargs): # Combined type hint for command
    if args.dry_run or args.verbose:
        if isinstance(command, str):
            print(command)
        else:
            print(" ".join(map(str, command)))
    if args.dry_run:
        return subprocess.CompletedProcess(args=command, returncode=0, stdout="", stderr="")
    else:
        # Ensure command is a list for subprocess.run if it's a shell command string
        if isinstance(command, str) and kwargs.get("shell") is True:
            pass # shell=True handles string command
        elif isinstance(command, str): # If not shell=True, string command should be split or it's an error
            command = command.split()

        output = subprocess.run(command, **kwargs)
        if output.returncode != 0:
            stderr_output = output.stderr
            if isinstance(stderr_output, bytes):
                stderr_output = stderr_output.decode(errors='replace')
            raise subprocess.SubprocessError(stderr_output)
        return output


def main():
    if args.subcommand == "cluster":
        handle_cluster()
    elif args.subcommand == "helm":
        handle_helm()
    elif args.subcommand == "upgrade":
        handle_helm_upgrade()
    elif args.subcommand == "config":
        # Merged call to generate_configs, passing both custom_values and enableEnaSubmission
        generate_configs(args.from_live, args.live_host, args.custom_values, args.enableEnaSubmission)


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
        str(HELM_CHART_DIR), # Ensure Path object is converted to string for command
        "-f",
        str(args.values), # Ensure Path object is converted to string
        "--set",
        "environment=local",
        "--set",
        f"branch={branch}",
    ]

    if args.for_e2e or args.dev:
        parameters += ["-f", str(HELM_CHART_DIR / "values_e2e_and_dev.yaml")] # Ensure Path object is converted
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

    if args.enableEnaSubmission: # This is a global flag
        parameters += ["--set", "disableEnaSubmission=false"]
    else: # Explicitly disable if not set, or helm chart default will apply
        parameters += ["--set", "disableEnaSubmission=true"]


    if get_codespace_name():
        parameters += get_codespace_params(get_codespace_name())

    output = run_command(parameters, capture_output=args.template, text=args.template) # capture if templating
    if args.template:
        print(output.stdout)


def handle_helm_upgrade():
    parameters = [
        "helm",
        "upgrade",
        HELM_RELEASE_NAME,
        str(HELM_CHART_DIR), # Ensure Path object is converted
    ]
    # Add other relevant parameters for upgrade if necessary, e.g., values files, set flags
    # For example, to align with install, one might want to re-apply values:
    # parameters.extend(["-f", str(args.values)]) # Example
    run_command(parameters)


def get_codespace_name():
    return os.environ.get("CODESPACE_NAME", None)


# Merged function definition for generate_configs
def generate_configs(from_live, live_host, custom_values_file, enable_ena_submission_flag):
    temp_dir_path = Path(tempfile.mkdtemp())

    print(f"Unprocessed config available in temp dir: {temp_dir_path}")

    helm_chart = str(HELM_CHART_DIR)
    codespace_name = get_codespace_name()

    output_dir = ROOT_DIR / "website" / "tests" / "config"
    output_dir.mkdir(parents=True, exist_ok=True) # Ensure output directory exists

    backend_config_path = temp_dir_path / "backend_config.json"
    generate_config(
        helm_chart,
        "templates/loculus-backend-config.yaml",
        backend_config_path,
        codespace_name,
        from_live,
        live_host,
        custom_values_file # Pass custom_values_file
    )

    website_config_path = temp_dir_path / "website_config.json"
    generate_config(
        helm_chart,
        "templates/loculus-website-config.yaml",
        website_config_path,
        codespace_name,
        from_live,
        live_host,
        custom_values_file # Pass custom_values_file
    )

    runtime_config_path = temp_dir_path / "runtime_config.json"
    generate_config(
        helm_chart,
        "templates/loculus-website-config.yaml", # Uses same template as website
        runtime_config_path,
        codespace_name,
        from_live,
        live_host,
        custom_values_file # Pass custom_values_file
    )

    if enable_ena_submission_flag: # Use the flag to control ENA config generation
        ena_submission_configmap_path = temp_dir_path / "config.yaml"
        ena_submission_configout_path = temp_dir_path / "ena-submission-config.yaml"
        generate_config(
            helm_chart,
            "templates/ena-submission-config.yaml",
            ena_submission_configmap_path,
            codespace_name,
            from_live,
            live_host,
            custom_values_file, # Pass custom_values_file for consistency
            output_path=ena_submission_configout_path # Explicitly name output_path argument
        )

    ingest_configmap_path = temp_dir_path / "config.yaml" # Used as key in helm output data
    ingest_template_path = "templates/ingest-config.yaml"
    ingest_configout_path = temp_dir_path / "ingest-config.yaml" # Actual output file
    generate_config(
        helm_chart,
        ingest_template_path,
        ingest_configmap_path, # This is the key for 'data' in ConfigMap
        codespace_name,
        from_live,
        live_host,
        custom_values_file, # Pass custom_values_file
        output_path=ingest_configout_path # Actual output file path
    )

    prepro_configmap_path = temp_dir_path / "preprocessing-config.yaml" # Used as key
    prepro_template_path = "templates/loculus-preprocessing-config.yaml"
    prepro_configout_path = temp_dir_path / "preprocessing-config.yaml" # Actual output file
    generate_config(
        helm_chart,
        prepro_template_path,
        prepro_configmap_path, # This is the key for 'data' in ConfigMap
        codespace_name,
        from_live,
        live_host,
        custom_values_file, # Pass custom_values_file
        output_path=prepro_configout_path # Actual output file path
    )

    run_command(
        [
            "python",
            str(ROOT_DIR / "kubernetes" / "config-processor" / "config-processor.py"),
            str(temp_dir_path),
            str(output_dir),
        ]
    )
    print(f"Config generation succeeded, processed config files available in {output_dir}")


def generate_config(
    helm_chart: str,
    template: str,
    configmap_path: Path, # This Path object's name is used as a key in the YAML data
    codespace_name: str | None = None,
    from_live: bool = False,
    live_host: str | None = None,
    custom_values: str | Path | None = None, # Can be str or Path
    output_path: Path | None = None, # Actual file path to write to
):
    if from_live and live_host:
        number_of_dots = live_host.count(".")
        if number_of_dots < 2:  # this is an imperfect hack
            raise ValueError("Currently only subdomains are supported as live-hosts")
            # To be able to cope with top level domains we need more logic to use the right subdomain separator - but we should probably avoid this anyway as we shouldn't use production domains
    
    helm_template_cmd = [
        "helm",
        "template",
        "name-does-not-matter", # Release name for template, can be arbitrary
        helm_chart,
        "--show-only",
        template,
        "--skip-schema-validation" # Added from one of the branches, kept for dev/e2e consistency
    ]
    if custom_values:
        helm_template_cmd.extend(["-f", str(custom_values)]) # Ensure Path is string

    # If output_path is not specified, use configmap_path as the destination for the *content*.
    # The name of the key in the ConfigMap (configmap_path.name) remains the same.
    effective_output_path = output_path if output_path else configmap_path

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
    
    helm_output_result = run_command(helm_template_cmd, capture_output=True, text=True)
    helm_output = helm_output_result.stdout
    
    if args.dry_run: # If dry_run, helm_output might be empty or from a dummy CompletedProcess
        if helm_output: print(f"Helm output for {template}:\n{helm_output[:500]}...") # Print snippet
        print(f"Dry run: Would attempt to process helm output for {template} into {effective_output_path}")
        return

    if not helm_output:
        print(f"Warning: Helm template for {template} produced no output. Skipping write to {effective_output_path}.")
        return

    try:
        parsed_yaml_docs = list(yaml.full_load_all(helm_output))
    except yaml.YAMLError as ye:
        print(f"Error parsing YAML output for {template}: {ye}")
        print(f"Problematic YAML:\n{helm_output}")
        return
        
    if not parsed_yaml_docs:
        print(f"Warning: Helm template for {template} produced YAML but it parsed to an empty list. Skipping write to {effective_output_path}.")
        return

    # The key to extract data from is based on configmap_path.name
    # e.g., if configmap_path is /tmp/xyz/backend_config.json, key is "backend_config.json"
    # e.g., if configmap_path is /tmp/xyz/config.yaml (for ingest), key is "config.yaml"
    data_key = configmap_path.name 

    if any(substring in template for substring in ["ingest", "preprocessing", "ena-submission-config.yaml"]):
        # These templates can produce multiple documents or documents needing special handling (e.g. per organism)
        # For multi-document YAML output (common with Helm templates that output multiple resources)
        # or for files that are YAML themselves (not JSON in YAML data field)
        written_files = []
        for doc_index, doc in enumerate(parsed_yaml_docs):
            if doc and "data" in doc and data_key in doc["data"]:
                config_content_str = doc["data"][data_key]
                try:
                    # Attempt to load the content as YAML, as it might be structured YAML itself
                    config_data = yaml.safe_load(config_content_str) 
                except yaml.YAMLError:
                    # If it's not valid YAML, treat it as a raw string (e.g., simple JSON string)
                    config_data = config_content_str # Keep as string

                # Determine output path for multi-organism or multi-document cases
                current_output_path = effective_output_path
                if isinstance(config_data, dict) and "organism" in config_data:
                    # Suffix with organism if present
                    current_output_path = effective_output_path.with_suffix(f'.{config_data["organism"]}{effective_output_path.suffix}')
                elif len(parsed_yaml_docs) > 1:
                    # Suffix with index if multiple unnamed documents
                    current_output_path = effective_output_path.with_name(f"{effective_output_path.stem}_{doc_index}{effective_output_path.suffix}")

                current_output_path.parent.mkdir(parents=True, exist_ok=True)
                with open(current_output_path, "w") as f:
                    if isinstance(config_data, (dict, list)): # If it was parsable YAML/JSON structure
                        yaml.dump(config_data, f)
                    else: # If it was a raw string
                        f.write(config_content_str)
                print(f"Wrote config to {current_output_path}")
                written_files.append(current_output_path)
            else:
                print(f"Warning: Document {doc_index} in {template} output did not contain 'data.{data_key}'. Skipping.")
        if not written_files:
             print(f"Warning: No data found for key '{data_key}' in any document from Helm output of {template}.")

    elif len(parsed_yaml_docs) == 1: # Single document expected for simple JSON configs
        doc = parsed_yaml_docs[0]
        if doc and "data" in doc and data_key in doc["data"]:
            config_content = doc["data"][data_key] # This is usually a JSON string
            effective_output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(effective_output_path, "w") as f:
                f.write(config_content)
            print(f"Wrote config to {effective_output_path}")
        else:
            print(f"Warning: Helm template for {template} (single doc) did not contain 'data.{data_key}'. Expected structure: ConfigMap with data field '{data_key}'.")
            print(f"YAML Doc received: {doc}")

    else:
        print(f"Warning: Helm template for {template} produced multiple YAML documents ({len(parsed_yaml_docs)}), but non-ingest/preprocessing/ENA template was not expected to. Processing first doc if possible.")
        # Optionally handle this case, e.g. by processing only the first document like the single doc case
        if parsed_yaml_docs and "data" in parsed_yaml_docs[0] and data_key in parsed_yaml_docs[0]["data"]:
             config_content = parsed_yaml_docs[0]["data"][data_key]
             effective_output_path.parent.mkdir(parents=True, exist_ok=True)
             with open(effective_output_path, "w") as f:
                 f.write(config_content)
             print(f"Wrote config (first doc of multiple) to {effective_output_path}")
        else:
            print(f"Could not extract 'data.{data_key}' from the first document of multiple for {template}")


def get_codespace_params(codespace_name):
    publicRuntimeConfig = {
        "websiteUrl": f"https://{codespace_name}-3000.app.github.dev",
        "backendUrl": f"https://{codespace_name}-8079.app.github.dev",
        "lapisUrlTemplate": f"https://{codespace_name}-8080.app.github.dev/%organism%",
        "keycloakUrl": f"https://{codespace_name}-8083.app.github.dev",
    }
    return [
        "--set-json",
        f"public={json.dumps(publicRuntimeConfig)}",
    ]


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
        "upgrade", # Use upgrade --install for idempotency
        "--install",
        "kubernetes-secret-generator",
        secret_generator_chart,
        "--namespace", "kube-system", # Typically installed in kube-system
        "--create-namespace",
        "--set",
        "secretLength=32",
        "--set",
        'watchNamespace=""', # Watch all namespaces
        "--set",
        "resources.limits.memory=400Mi",
        "--set",
        "resources.requests.memory=200Mi",
    ]
    run_command(helm_install_command)
    print("Kubernetes Secret Generator installation/upgrade complete.")


if __name__ == "__main__":
    main()