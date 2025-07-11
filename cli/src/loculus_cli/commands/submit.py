"""Submission commands for Loculus CLI."""

import csv
from pathlib import Path
from typing import Dict, List, Optional

import click
from rich.console import Console
from rich.table import Table

from ..api.backend import BackendClient
from ..auth.client import AuthClient
from ..config import get_instance_config
from ..utils.console import print_error, handle_cli_error, check_authentication
from ..utils.guards import require_instance, require_organism, require_group

console = Console()


@click.group(name="submit")
def submit_group() -> None:
    """Submission commands."""
    pass


@submit_group.command()
@click.option(
    "--metadata",
    "-m",
    type=click.Path(exists=True, path_type=Path),
    required=True,
    help="Path to metadata file (TSV format)",
)
@click.option(
    "--sequences",
    "-s",
    type=click.Path(exists=True, path_type=Path),
    required=True,
    help="Path to sequences file (FASTA format)",
)
@click.option(
    "--data-use-terms",
    type=click.Choice(["OPEN", "RESTRICTED"]),
    default="OPEN",
    help="Data use terms",
)
@click.pass_context
def sequences(
    ctx: click.Context,
    metadata: Path,
    sequences: Path,
    data_use_terms: str,
) -> None:
    """Submit sequences to Loculus."""
    instance = require_instance(ctx, ctx.obj.get("instance"))
    instance_config = get_instance_config(instance)
    
    # Get organism with guard (required for submit)
    organism = require_organism(instance, ctx.obj.get("organism"))
    
    # Get group with guard (required for submit)
    group = require_group(instance, ctx.obj.get("group"))
    
    auth_client = AuthClient(instance_config)
    backend_client = BackendClient(instance_config, auth_client)
    
    try:
        # Check authentication
        check_authentication(auth_client)
        current_user = auth_client.get_current_user()
        
        # Get user's groups if group not specified
        if group is None:
            with console.status("Getting user groups..."):
                try:
                    groups = backend_client.get_groups(current_user)
                except Exception as e:
                    print_error("Failed to get groups", e)
                    console.print("This may indicate permission issues or that the test user")
                    console.print("doesn't have access to any submission groups.")
                    raise click.ClickException("Cannot access groups for submission")
            
            if not groups:
                print_error("No groups found")
                console.print("Please contact an administrator to be added to a group")
                raise click.ClickException("No groups available")
            
            if len(groups) == 1:
                group = groups[0].groupId
                console.print(f"Using group: [bold green]{groups[0].groupName}[/bold green]")
            else:
                console.print("Available groups:")
                for g in groups:
                    console.print(f"  {g.groupId}: {g.groupName}")
                group = click.prompt("Select group ID", type=int)
        
        
        # Submit sequences
        with console.status("Submitting sequences..."):
            result = backend_client.submit_sequences(
                username=current_user,
                organism=organism,
                metadata_file=metadata,
                sequence_file=sequences,
                group_id=group,
                data_use_terms=data_use_terms,
            )
        
        # Display results
        console.print("✓ Submission successful!")
        console.print(f"Submitted {len(result.accession_versions)} sequences")
        
        if result.accession_versions:
            table = Table(title="Submitted Sequences")
            table.add_column("Accession", style="green")
            table.add_column("Version", style="blue")
            
            for av in result.accession_versions:
                table.add_row(av.accession, str(av.version))
            
            console.print(table)
        
        if result.warnings:
            console.print("\n[bold yellow]⚠ Warnings:[/bold yellow]")
            for warning in result.warnings:
                console.print(f"  • {warning}")
        
        if result.errors:
            console.print("\n[bold red]✗ Errors:[/bold red]")
            for error in result.errors:
                console.print(f"  • {error}")
        
    except click.ClickException:
        raise
    except Exception as e:
        handle_cli_error("Submission failed", e)
    finally:
        backend_client.close()




@submit_group.command()
@click.option(
    "--output",
    "-f",
    type=click.Path(path_type=Path),
    help="Output file path (default: metadata_template.tsv)",
)
@click.pass_context
def template(
    ctx: click.Context,
    output: Optional[Path],
) -> None:
    """Generate metadata template for an organism."""
    instance = require_instance(ctx, ctx.obj.get("instance"))
    instance_config = get_instance_config(instance)
    
    # Get organism with guard (required for template)
    organism = require_organism(instance, ctx.obj.get("organism"))
    
    try:
        with console.status("Getting organism schema..."):
            schema = instance_config.get_organism_schema(organism)
        
        # Generate template
        if output is None:
            output = Path("metadata_template.tsv")
        
        # Extract metadata fields from schema
        fields = []
        if schema and "metadata" in schema:
            for field_info in schema["metadata"]:
                if isinstance(field_info, dict) and "name" in field_info:
                    fields.append(field_info["name"])
        
        
        
        # Write template
        with open(output, "w", newline="") as f:
            writer = csv.writer(f, delimiter="\t")
            writer.writerow(fields)
            # Add an example row with placeholder values
            example_row = [f"example_{field}" for field in fields]
            writer.writerow(example_row)
        
        console.print(f"✓ Template generated: [bold green]{output}[/bold green]")
        console.print(f"Fields: {', '.join(fields)}")
        
    except click.ClickException:
        raise
    except Exception as e:
        handle_cli_error("Template generation failed", e)