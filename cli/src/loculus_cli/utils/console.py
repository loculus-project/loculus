"""
Shared console utilities for the Loculus CLI.
"""
from typing import Optional

import click
from rich.console import Console


def get_stderr_console() -> Console:
    """
    Create a console instance that writes to stderr.
    Used for progress indicators and status messages.
    """
    return Console(stderr=True)


def print_error(
    message: str,
    exception: Optional[Exception] = None,
    console: Optional[Console] = None,
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


def print_success(message: str, console: Optional[Console] = None) -> None:
    """
    Print a formatted success message to console.

    Args:
        message: The success message to display
        console: Optional console instance to use (defaults to stdout console)
    """
    if console is None:
        console = Console()

    console.print(f"[bold green]✓ {message}[/bold green]")


def print_warning(message: str, console: Optional[Console] = None) -> None:
    """
    Print a formatted warning message to console.

    Args:
        message: The warning message to display
        console: Optional console instance to use (defaults to stdout console)
    """
    if console is None:
        console = Console()

    console.print(f"[bold yellow]⚠ {message}[/bold yellow]")


def handle_cli_error(
    message: str, exception: Exception, console: Optional[Console] = None
) -> None:
    """
    Handle CLI errors with consistent formatting and exit behavior.

    Args:
        message: The error message to display
        exception: The exception that occurred
        console: Optional console instance to use (defaults to stdout console)
    """
    print_error(message, exception, console)
    raise click.ClickException(str(exception))


def check_authentication(auth_client, console: Optional[Console] = None) -> None:
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
