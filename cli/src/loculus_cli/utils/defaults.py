"""Utilities for handling default values."""

from typing import Optional, Tuple

import click
from rich.console import Console

from ..config import load_config

console = Console()


def get_organism_with_default(organism: Optional[str], required: bool = True) -> Optional[str]:
    """Get organism value, using default if not specified.
    
    Args:
        organism: The organism value passed by the user
        required: Whether organism is required for this command
        
    Returns:
        The organism to use (from parameter or default)
        
    Raises:
        click.Abort: If organism is required but not provided and no default set
    """
    if organism is not None:
        return organism
    
    config = load_config()
    default_organism = config.defaults.organism
    
    if default_organism is not None:
        console.print(f"[dim]Using default organism: {default_organism}[/dim]")
        return default_organism
    
    if required:
        console.print("[red]Error: --organism is required (or set default with 'loculus organism <name>')[/red]")
        raise click.Abort()
    
    return None


def get_group_with_default(group: Optional[int]) -> Optional[int]:
    """Get group value, using default if not specified.
    
    Args:
        group: The group value passed by the user
        
    Returns:
        The group to use (from parameter or default)
    """
    if group is not None:
        return group
    
    config = load_config()
    default_group = config.defaults.group
    
    if default_group is not None:
        console.print(f"[dim]Using default group: {default_group}[/dim]")
        return default_group
    
    return None


def get_organism_and_group_with_defaults(
    organism: Optional[str], 
    group: Optional[int],
    organism_required: bool = True
) -> Tuple[Optional[str], Optional[int]]:
    """Get organism and group values, using defaults if not specified.
    
    Args:
        organism: The organism value passed by the user
        group: The group value passed by the user
        organism_required: Whether organism is required for this command
        
    Returns:
        Tuple of (organism, group) to use
        
    Raises:
        click.Abort: If organism is required but not provided and no default set
    """
    organism = get_organism_with_default(organism, required=organism_required)
    group = get_group_with_default(group)
    return organism, group