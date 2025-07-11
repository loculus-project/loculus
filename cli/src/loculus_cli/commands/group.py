"""Group management commands for Loculus CLI."""

from typing import Optional

import click
from rich.console import Console
from rich.table import Table

from ..config import get_config_value, get_instance_config, set_config_value
from ..utils.instance_guard import require_instance

console = Console()


@click.command(name="group")
@click.argument("group", type=int, required=False)
@click.option("--none", is_flag=True, help="Clear the default group")
@click.pass_context
def group_command(ctx: click.Context, group: Optional[int], none: bool) -> None:
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
            instance = require_instance(ctx, ctx.obj.get("instance"))
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
                    console.print("\n[dim]Usage: loculus group <id>[/dim]")
                    console.print("[dim]       loculus group --none  (to clear)[/dim]")
                else:
                    console.print("[yellow]No groups found. You can create a group through the website or ask a group administrator to add you to their existing group.[/yellow]")
                    
            except Exception as e:
                console.print(f"[yellow]Could not fetch available groups: {e}[/yellow]")
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        raise click.ClickException(str(e))