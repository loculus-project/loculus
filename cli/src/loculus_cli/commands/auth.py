"""Authentication commands for Loculus CLI."""

import click
from rich.console import Console
from rich.prompt import Prompt

from ..auth.client import AuthClient
from ..config import get_instance_config

console = Console()


@click.group(name="auth")
def auth_group() -> None:
    """Authentication commands."""
    pass


@auth_group.command()
@click.option(
    "--username",
    "-u",
    prompt=True,
    help="Username for authentication",
)
@click.option(
    "--password",
    "-p",
    prompt=True,
    hide_input=True,
    help="Password for authentication",
)
@click.pass_context
def login(ctx: click.Context, username: str, password: str) -> None:
    """Login to Loculus."""
    instance = ctx.obj.get("instance")
    instance_config = get_instance_config(instance)
    
    auth_client = AuthClient(instance_config)
    
    try:
        with console.status("Logging in..."):
            token_info = auth_client.login(username, password)
            auth_client.set_current_user(username)
        
        console.print(f"✓ Successfully logged in as [bold green]{username}[/bold green]")
        console.print(f"Token expires in {token_info.expires_in // 60} minutes")
        
    except Exception as e:
        console.print(f"[bold red]✗ Login failed:[/bold red] {e}")
        raise click.ClickException(str(e))


@auth_group.command()
@click.pass_context
def logout(ctx: click.Context) -> None:
    """Logout and clear stored credentials."""
    instance = ctx.obj.get("instance")
    instance_config = get_instance_config(instance)
    
    auth_client = AuthClient(instance_config)
    
    try:
        current_user = auth_client.get_current_user()
        if current_user:
            auth_client.logout(current_user)
            auth_client.clear_current_user()
            console.print(f"✓ Successfully logged out [bold green]{current_user}[/bold green]")
        else:
            console.print("No user currently logged in")
            
    except Exception as e:
        console.print(f"[bold red]✗ Logout failed:[/bold red] {e}")
        raise click.ClickException(str(e))


@auth_group.command()
@click.pass_context
def status(ctx: click.Context) -> None:
    """Show current authentication status."""
    instance = ctx.obj.get("instance")
    instance_config = get_instance_config(instance)
    
    auth_client = AuthClient(instance_config)
    
    try:
        current_user = auth_client.get_current_user()
        if current_user:
            if auth_client.is_authenticated(current_user):
                token_info = auth_client.get_valid_token(current_user)
                if token_info:
                    expires_in_minutes = token_info.expires_in // 60
                    console.print(f"✓ Logged in as [bold green]{current_user}[/bold green]")
                    console.print(f"Token expires in {expires_in_minutes} minutes")
                else:
                    console.print(f"[bold yellow]! Token for {current_user} is invalid[/bold yellow]")
            else:
                console.print(f"[bold yellow]! {current_user} is not authenticated[/bold yellow]")
        else:
            console.print("[bold red]✗ Not logged in[/bold red]")
            
    except Exception as e:
        console.print(f"[bold red]✗ Failed to check status:[/bold red] {e}")
        raise click.ClickException(str(e))


@auth_group.command()
@click.pass_context
def token(ctx: click.Context) -> None:
    """Display current access token."""
    instance = ctx.obj.get("instance")
    instance_config = get_instance_config(instance)
    
    auth_client = AuthClient(instance_config)
    
    try:
        current_user = auth_client.get_current_user()
        if not current_user:
            console.print("[bold red]✗ Not logged in[/bold red]")
            raise click.ClickException("Not logged in")
        
        token_info = auth_client.get_valid_token(current_user)
        if not token_info:
            console.print("[bold red]✗ No valid token available[/bold red]")
            raise click.ClickException("No valid token available")
        
        console.print(f"Access token: {token_info.access_token}")
        console.print(f"Token type: {token_info.token_type}")
        console.print(f"Expires in: {token_info.expires_in} seconds")
        
    except click.ClickException:
        raise
    except Exception as e:
        console.print(f"[bold red]✗ Failed to get token:[/bold red] {e}")
        raise click.ClickException(str(e))