"""Configuration commands for Loculus CLI."""

from typing import Optional

import click
from rich.console import Console
from rich.table import Table

from ..config import get_config_value, load_config, save_config, set_config_value, InstanceConfig, get_instance_config
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



@config_group.command(name="organism")
@click.argument("organism", required=False)
@click.option("--none", is_flag=True, help="Clear the default organism")
@click.pass_context
def set_default_organism(ctx: click.Context, organism: Optional[str], none: bool) -> None:
    """Set or show default organism for commands."""
    try:
        if none:
            set_config_value("defaults.organism", None)
            console.print("[green]✓[/green] Cleared default organism")
        elif organism:
            set_config_value("defaults.organism", organism)
            console.print(f"[green]✓[/green] Set default organism to [bold]{organism}[/bold]")
        else:
            # Show available organisms and current default
            instance = ctx.obj.get("instance")
            instance_config = get_instance_config(instance)
            
            current = get_config_value("defaults.organism")
            if current:
                console.print(f"Current default organism: [bold green]{current}[/bold green]\n")
            else:
                console.print("No default organism set\n")
            
            # List available organisms
            try:
                organisms = instance_config.get_organisms()
                console.print("[bold]Available organisms:[/bold]")
                for org in sorted(organisms):
                    if org == current:
                        console.print(f"  • {org} [dim](current default)[/dim]")
                    else:
                        console.print(f"  • {org}")
                console.print("\n[dim]Usage: loculus config organism <name>[/dim]")
                console.print("[dim]       loculus config organism --none  (to clear)[/dim]")
            except Exception as e:
                console.print(f"[yellow]Could not fetch available organisms: {e}[/yellow]")
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        raise click.ClickException(str(e))


@config_group.command(name="group")
@click.argument("group", type=int, required=False)
@click.option("--none", is_flag=True, help="Clear the default group")
@click.pass_context
def set_default_group(ctx: click.Context, group: Optional[int], none: bool) -> None:
    """Set or show default group for commands."""
    try:
        if none:
            set_config_value("defaults.group", None)
            console.print("[green]✓[/green] Cleared default group")
        elif group is not None:
            set_config_value("defaults.group", group)
            console.print(f"[green]✓[/green] Set default group to [bold]{group}[/bold]")
        else:
            # Show available groups and current default
            instance = ctx.obj.get("instance")
            instance_config = get_instance_config(instance)
            
            current = get_config_value("defaults.group")
            if current is not None:
                console.print(f"Current default group: [bold green]{current}[/bold green]\n")
            else:
                console.print("No default group set\n")
            
            # List available groups
            try:
                from ..auth.client import AuthClient
                from ..api.backend import BackendClient
                
                auth_client = AuthClient(instance_config)
                current_user = auth_client.get_current_user()
                
                if not current_user:
                    console.print("[yellow]Not logged in. Please run 'loculus auth login' first[/yellow]")
                    return
                
                backend_client = BackendClient(instance_config, auth_client)
                groups = backend_client.get_groups(current_user)
                
                if groups:
                    console.print("[bold]Available groups:[/bold]")
                    table = Table(show_header=True, header_style="bold")
                    table.add_column("ID", style="cyan", width=10)
                    table.add_column("Name", style="green")
                    table.add_column("Status", style="dim")
                    
                    for g in groups:
                        status = "[dim](current default)[/dim]" if g.groupId == current else ""
                        table.add_row(str(g.groupId), g.groupName, status)
                    
                    console.print(table)
                    console.print("\n[dim]Usage: loculus config group <id>[/dim]")
                    console.print("[dim]       loculus config group --none  (to clear)[/dim]")
                else:
                    console.print("[yellow]No groups found. Contact an administrator to be added to a group.[/yellow]")
                    
            except Exception as e:
                console.print(f"[yellow]Could not fetch available groups: {e}[/yellow]")
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        raise click.ClickException(str(e))


