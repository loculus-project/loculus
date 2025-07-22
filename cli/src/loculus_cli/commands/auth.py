"""Authentication commands for Loculus CLI."""

import click
from rich.console import Console
from rich.prompt import Prompt

from ..auth.client import AuthClient
from ..config import get_instance_config
from ..utils.console import handle_cli_error, print_error
from ..utils.guards import require_instance

console = Console()


@click.group(name="auth")
def auth_group() -> None:
    """Authentication commands."""
    pass


@auth_group.command()
@click.option(
    "--username",
    "-u",
    help="Username for authentication",
)
@click.option(
    "--password",
    "-p",
    help="Password for authentication",
)
@click.pass_context
def login(ctx: click.Context, username: str, password: str) -> None:
    """Login to Loculus."""
    instance = require_instance(ctx, ctx.obj.get("instance"))
    instance_config = get_instance_config(instance)

    # Display instance information
    console.print(f"[dim]Logging into instance: {instance}[/dim]")

    # Prompt for credentials if not provided
    if not username:
        username = Prompt.ask("Username")
    if not password:
        password = Prompt.ask("Password", password=True)

    auth_client = AuthClient(instance_config)

    try:
        with console.status("Logging in..."):
            token_info = auth_client.login(username, password)
            auth_client.set_current_user(username)

        console.print(
            f"✓ Successfully logged in as [bold green]{username}[/bold green]"
        )
        console.print(f"Instance: [bold cyan]{instance}[/bold cyan]")
        console.print(f"Token expires in {token_info.expires_in // 60} minutes")

    except Exception as e:
        handle_cli_error("Login failed", e)


@auth_group.command()
@click.pass_context
def logout(ctx: click.Context) -> None:
    """Logout and clear stored credentials."""
    instance = require_instance(ctx, ctx.obj.get("instance"))
    instance_config = get_instance_config(instance)

    auth_client = AuthClient(instance_config)

    try:
        current_user = auth_client.get_current_user()
        if current_user:
            auth_client.logout(current_user)
            auth_client.clear_current_user()
            console.print(
                f"✓ Successfully logged out [bold green]{current_user}[/bold green]"
            )
            console.print(f"Instance: [bold cyan]{instance}[/bold cyan]")
        else:
            console.print("No user currently logged in")
            console.print(f"Instance: [bold cyan]{instance}[/bold cyan]")

    except Exception as e:
        handle_cli_error("Logout failed", e)


@auth_group.command()
@click.pass_context
def status(ctx: click.Context) -> None:
    """Show current authentication status."""
    instance = require_instance(ctx, ctx.obj.get("instance"))
    instance_config = get_instance_config(instance)

    auth_client = AuthClient(instance_config)

    try:
        console.print(f"Instance: [bold cyan]{instance}[/bold cyan]")
        current_user = auth_client.get_current_user()
        if current_user:
            if auth_client.is_authenticated(current_user):
                token_info = auth_client.get_valid_token(current_user)
                if token_info:
                    expires_in_minutes = token_info.expires_in // 60
                    console.print(
                        f"✓ Logged in as [bold green]{current_user}[/bold green]"
                    )
                    console.print(f"Token expires in {expires_in_minutes} minutes")
                else:
                    console.print(
                        f"[bold yellow]! Token for {current_user} is invalid"
                        "[/bold yellow]"
                    )
            else:
                console.print(
                    f"[bold yellow]! {current_user} is not authenticated[/bold yellow]"
                )
        else:
            print_error("Not logged in")

    except Exception as e:
        handle_cli_error("Failed to check status", e)


@auth_group.command()
@click.pass_context
def token(ctx: click.Context) -> None:
    """Display current access token."""
    instance = require_instance(ctx, ctx.obj.get("instance"))
    instance_config = get_instance_config(instance)

    auth_client = AuthClient(instance_config)

    try:
        console.print(f"Instance: [bold cyan]{instance}[/bold cyan]")
        current_user = auth_client.get_current_user()
        if not current_user:
            print_error("Not logged in")
            raise click.ClickException("Not logged in")

        token_info = auth_client.get_valid_token(current_user)
        if not token_info:
            print_error("No valid token available")
            raise click.ClickException("No valid token available")

        console.print(f"User: [bold green]{current_user}[/bold green]")
        console.print(f"Access token: {token_info.access_token}")
        console.print(f"Token type: {token_info.token_type}")
        console.print(f"Expires in: {token_info.expires_in} seconds")

    except click.ClickException:
        raise
    except Exception as e:
        handle_cli_error("Failed to get token", e)
