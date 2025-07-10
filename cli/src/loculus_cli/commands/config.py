"""Configuration commands for Loculus CLI."""

import click
from rich.console import Console
from rich.table import Table

from ..config import get_config_value, load_config, save_config, set_config_value, InstanceConfig
from ..instance_info import InstanceInfo

console = Console()


@click.group(name="config")
def config_group() -> None:
    """Configuration commands."""
    pass


@config_group.command()
@click.argument("key")
@click.argument("value")
def set(key: str, value: str) -> None:
    """Set a configuration value."""
    try:
        set_config_value(key, value)
        console.print(f"✓ Set [bold green]{key}[/bold green] = [bold blue]{value}[/bold blue]")
    except Exception as e:
        console.print(f"[bold red]✗ Failed to set config:[/bold red] {e}")
        raise click.ClickException(str(e))


@config_group.command()
@click.argument("key")
def get(key: str) -> None:
    """Get a configuration value."""
    try:
        value = get_config_value(key)
        if value is not None:
            console.print(f"[bold green]{key}[/bold green] = [bold blue]{value}[/bold blue]")
        else:
            console.print(f"[bold yellow]Configuration key '{key}' not found[/bold yellow]")
    except Exception as e:
        console.print(f"[bold red]✗ Failed to get config:[/bold red] {e}")
        raise click.ClickException(str(e))


@config_group.command()
def list() -> None:
    """List all configuration values."""
    try:
        config = load_config()
        config_dict = config.model_dump()
        
        table = Table(title="Configuration")
        table.add_column("Key", style="green")
        table.add_column("Value", style="blue")
        
        def add_config_items(data: dict, prefix: str = "") -> None:
            for key, value in data.items():
                full_key = f"{prefix}.{key}" if prefix else key
                
                if hasattr(value, 'items'):  # Check if it's dict-like
                    add_config_items(value, full_key)
                elif hasattr(value, '__iter__') and not isinstance(value, str):  # Check if it's list-like
                    table.add_row(full_key, str(value))
                else:
                    table.add_row(full_key, str(value) if value is not None else "")
        
        add_config_items(config_dict)
        console.print(table)
        
    except Exception as e:
        console.print(f"[bold red]✗ Failed to list config:[/bold red] {e}")
        raise click.ClickException(str(e))


@config_group.command()
@click.argument("instance_url")
@click.option("--set-default", is_flag=True, help="Set as default instance")
@click.option("--keycloak-realm", default="loculus", help="Keycloak realm")
@click.option("--keycloak-client-id", default="backend-client", help="Keycloak client ID")
def configure(
    instance_url: str,
    set_default: bool,
    keycloak_realm: str,
    keycloak_client_id: str,
) -> None:
    """Auto-configure CLI from instance URL using loculus-info endpoint."""
    try:
        # Validate instance by fetching info
        console.print(f"Connecting to {instance_url}...")
        instance_info = InstanceInfo(instance_url)
        info = instance_info.get_info()
        
        console.print(f"[green]✓[/green] Connected to {info['title']}")
        if info.get('version'):
            console.print(f"Version: {info['version']}")
        
        organisms = instance_info.get_organisms()
        console.print(f"Available organisms: {', '.join(organisms[:5])}{'...' if len(organisms) > 5 else ''}")
        
        # Extract instance name from URL
        instance_name = instance_url.replace("https://", "").replace("http://", "")
        
        # Save configuration
        config = load_config()
        config.instances[instance_name] = InstanceConfig(
            instance_url=instance_url,
            keycloak_realm=keycloak_realm,
            keycloak_client_id=keycloak_client_id
        )
        
        if set_default or not config.default_instance:
            config.default_instance = instance_name
            console.print(f"[green]✓[/green] Set as default instance")
        
        save_config(config)
        console.print(f"[green]✓[/green] Configured instance '{instance_name}'")
        
    except Exception as e:
        console.print(f"[red]Error: Failed to configure instance: {e}[/red]")
        raise click.ClickException(str(e))


@config_group.command()
@click.argument("instance")
@click.argument("instance_url")
@click.option("--keycloak-realm", default="loculus", help="Keycloak realm")
@click.option("--keycloak-client-id", default="backend-client", help="Keycloak client ID")
def add_instance(
    instance: str,
    instance_url: str,
    keycloak_realm: str,
    keycloak_client_id: str,
) -> None:
    """Add a new instance configuration (legacy command - use 'configure' instead)."""
    try:
        set_config_value(f"instances.{instance}.instance_url", instance_url)
        set_config_value(f"instances.{instance}.keycloak_realm", keycloak_realm)
        set_config_value(f"instances.{instance}.keycloak_client_id", keycloak_client_id)
        
        console.print(f"✓ Added instance [bold green]{instance}[/bold green]")
        console.print("[dim]Note: Use 'loculus config configure' for automatic setup[/dim]")
        
    except Exception as e:
        console.print(f"[bold red]✗ Failed to add instance:[/bold red] {e}")
        raise click.ClickException(str(e))


@config_group.command()
@click.argument("instance")
def remove_instance(instance: str) -> None:
    """Remove an instance configuration."""
    try:
        config = load_config()
        if instance in config.instances:
            del config.instances[instance]
            from ..config import save_config
            save_config(config)
            console.print(f"✓ Removed instance [bold green]{instance}[/bold green]")
        else:
            console.print(f"[bold yellow]Instance '{instance}' not found[/bold yellow]")
        
    except Exception as e:
        console.print(f"[bold red]✗ Failed to remove instance:[/bold red] {e}")
        raise click.ClickException(str(e))


@config_group.command()
def list_instances() -> None:
    """List all configured instances."""
    try:
        config = load_config()
        
        if not config.instances:
            console.print("[bold yellow]No instances configured[/bold yellow]")
            return
        
        table = Table(title="Configured Instances")
        table.add_column("Instance", style="green")
        table.add_column("Instance URL", style="blue")
        table.add_column("Status", style="yellow")
        
        for name, instance_config in config.instances.items():
            # Try to check if instance is accessible
            status = "Unknown"
            try:
                if hasattr(instance_config, 'instance_url'):
                    instance_info = InstanceInfo(instance_config.instance_url)
                    info = instance_info.get_info()
                    status = f"✓ {info.get('title', 'Connected')}"
                else:
                    status = "Legacy config"
            except:
                status = "✗ Unreachable"
            
            instance_url = getattr(instance_config, 'instance_url', 'Legacy config')
            table.add_row(name, instance_url, status)
        
        console.print(table)
        
        if config.default_instance:
            console.print(f"\nDefault instance: [bold green]{config.default_instance}[/bold green]")
        
    except Exception as e:
        console.print(f"[bold red]✗ Failed to list instances:[/bold red] {e}")
        raise click.ClickException(str(e))