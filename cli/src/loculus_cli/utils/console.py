"""
Shared console utilities for the Loculus CLI.
"""

import click
from rich.console import Console

from ..auth.client import AuthClient


def get_stderr_console() -> Console:
    """
    Create a console instance that writes to stderr.
    Used for progress indicators and status messages.
    """
    return Console(stderr=True)


def print_error(
    message: str,
    exception: Exception | None = None,
    console: Console | None = None,
) -> None:
    """
    Print a formatted error message to console.

    Args:
        message: The error message to display
        exception: Optional exception object to include details from
        console: Optional console instance to use (defaults to stdout console)
    """
    if console is None:
        console = Console()

    if exception:
        console.print(f"[bold red]✗ {message}:[/bold red] {exception}")
    else:
        console.print(f"[bold red]✗ {message}[/bold red]")


def handle_cli_error(
    message: str, exception: Exception, console: Console | None = None
) -> None:
    """
    Handle CLI errors with consistent formatting and exit behavior.

    Args:
        message: The error message to display
        exception: The exception that occurred
        console: Optional console instance to use (defaults to stdout console)
    """
    print_error(message, exception, console)
    raise click.ClickException(str(exception)) from exception


def check_authentication(
    auth_client: AuthClient, console: Console | None = None
) -> None:
    """
    Check if user is authenticated and raise appropriate error if not.

    Args:
        auth_client: The authentication client to check
        console: Optional console instance to use (defaults to stdout console)
    """
    current_user = auth_client.get_current_user()
    if not current_user:
        print_error("Not logged in", console=console)
        raise click.ClickException("Please log in first using 'loculus auth login'")
