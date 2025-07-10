"""Revision commands for Loculus CLI."""

import csv
from pathlib import Path
from typing import Optional

import click
from rich.console import Console
from rich.table import Table

from ..api.backend import BackendClient
from ..auth.client import AuthClient
from ..config import get_instance_config

console = Console()


@click.group(name="revise")
def revise_group() -> None:
    """Sequence revision commands."""
    pass


@revise_group.command()
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
    "--organism",
    "-o",
    required=True,
    help="Organism name (e.g., 'Mpox', 'H5N1')",
)
@click.option(
    "--group",
    "-g",
    type=int,
    help="Group ID for revision",
)
@click.pass_context
def sequence(
    ctx: click.Context,
    metadata: Path,
    sequences: Path,
    organism: str,
    group: Optional[int],
) -> None:
    """Revise sequences in Loculus."""
    instance = ctx.obj.get("instance")
    instance_config = get_instance_config(instance)
    
    auth_client = AuthClient(instance_config)
    backend_client = BackendClient(instance_config, auth_client)
    
    try:
        # Check authentication
        current_user = auth_client.get_current_user()
        if not current_user:
            console.print("[bold red]✗ Not logged in[/bold red]")
            console.print("Please run 'loculus auth login' first")
            raise click.ClickException("Not authenticated")
        
        # Get user's groups if group not specified
        if group is None:
            with console.status("Getting user groups..."):
                groups = backend_client.get_groups(current_user)
            
            if not groups:
                console.print("[bold red]✗ No groups found[/bold red]")
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
        
        # Validate files first
        console.print("Validating files...")
        try:
            validation_result = backend_client.validate_sequences(
                organism=organism,
                metadata_file=metadata,
                sequence_file=sequences,
            )
            
            if not validation_result.valid:
                console.print("[bold red]✗ Validation failed[/bold red]")
                for error in validation_result.errors:
                    console.print(f"  • {error.message}")
                    if error.field:
                        console.print(f"    Field: {error.field}")
                    if error.line_number:
                        console.print(f"    Line: {error.line_number}")
                raise click.ClickException("Validation failed")
            
            if validation_result.warnings:
                console.print("[bold yellow]⚠ Validation warnings:[/bold yellow]")
                for warning in validation_result.warnings:
                    console.print(f"  • {warning}")
            
            console.print("✓ Files validated successfully")
            
        except Exception as e:
            console.print(f"[bold red]✗ Validation failed:[/bold red] {e}")
            raise click.ClickException(f"Validation failed: {e}")
        
        # Revise sequences
        with console.status("Revising sequences..."):
            result = backend_client.revise_sequences(
                username=current_user,
                organism=organism,
                metadata_file=metadata,
                sequence_file=sequences,
                group_id=group,
            )
        
        # Display results
        console.print("✓ Revision successful!")
        console.print(f"Revised {len(result.accession_versions)} sequences")
        
        if result.accession_versions:
            table = Table(title="Revised Sequences")
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
        console.print(f"[bold red]✗ Revision failed:[/bold red] {e}")
        raise click.ClickException(str(e))
    finally:
        backend_client.close()


@revise_group.command()
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
    "--organism",
    "-o",
    required=True,
    help="Organism name (e.g., 'Mpox', 'H5N1')",
)
@click.option(
    "--group",
    "-g",
    type=int,
    help="Group ID for revision",
)
@click.option(
    "--batch-size",
    type=int,
    default=100,
    help="Number of sequences to process at once",
)
@click.pass_context
def batch(
    ctx: click.Context,
    metadata: Path,
    sequences: Path,
    organism: str,
    group: Optional[int],
    batch_size: int,
) -> None:
    """Revise sequences in batches."""
    instance = ctx.obj.get("instance")
    instance_config = get_instance_config(instance)
    
    auth_client = AuthClient(instance_config)
    backend_client = BackendClient(instance_config, auth_client)
    
    try:
        # Check authentication
        current_user = auth_client.get_current_user()
        if not current_user:
            console.print("[bold red]✗ Not logged in[/bold red]")
            console.print("Please run 'loculus auth login' first")
            raise click.ClickException("Not authenticated")
        
        # Get user's groups if group not specified
        if group is None:
            with console.status("Getting user groups..."):
                groups = backend_client.get_groups(current_user)
            
            if not groups:
                console.print("[bold red]✗ No groups found[/bold red]")
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
        
        # Read and split files into batches
        console.print("Reading input files...")
        
        # Read metadata
        metadata_rows = []
        with open(metadata, "r") as f:
            reader = csv.DictReader(f, delimiter="\t")
            metadata_rows = list(reader)
        
        # Read sequences
        sequences_dict = {}
        with open(sequences, "r") as f:
            current_header = None
            current_sequence = []
            
            for line in f:
                line = line.strip()
                if line.startswith(">"):
                    if current_header:
                        sequences_dict[current_header] = "\n".join(current_sequence)
                    current_header = line[1:]  # Remove >
                    current_sequence = []
                else:
                    current_sequence.append(line)
            
            if current_header:
                sequences_dict[current_header] = "\n".join(current_sequence)
        
        total_sequences = len(metadata_rows)
        console.print(f"Processing {total_sequences} sequences in batches of {batch_size}")
        
        # Process in batches
        all_results = []
        for i in range(0, total_sequences, batch_size):
            batch_end = min(i + batch_size, total_sequences)
            batch_metadata = metadata_rows[i:batch_end]
            
            console.print(f"Processing batch {i // batch_size + 1} ({i + 1}-{batch_end} of {total_sequences})")
            
            # Create temporary files for this batch
            temp_metadata = Path(f"temp_metadata_batch_{i}.tsv")
            temp_sequences = Path(f"temp_sequences_batch_{i}.fasta")
            
            try:
                # Write batch metadata
                with open(temp_metadata, "w", newline="") as f:
                    if batch_metadata:
                        writer = csv.DictWriter(f, fieldnames=batch_metadata[0].keys(), delimiter="\t")
                        writer.writeheader()
                        writer.writerows(batch_metadata)
                
                # Write batch sequences
                with open(temp_sequences, "w") as f:
                    for row in batch_metadata:
                        # Look for sequence identifier in metadata
                        seq_id = row.get("sequence_name") or row.get("accession") or row.get("id")
                        if seq_id and seq_id in sequences_dict:
                            f.write(f">{seq_id}\n")
                            f.write(sequences_dict[seq_id])
                            f.write("\n")
                
                # Revise this batch
                with console.status(f"Revising batch {i // batch_size + 1}..."):
                    result = backend_client.revise_sequences(
                        username=current_user,
                        organism=organism,
                        metadata_file=temp_metadata,
                        sequence_file=temp_sequences,
                        group_id=group,
                    )
                
                all_results.append(result)
                console.print(f"✓ Batch {i // batch_size + 1} completed: {len(result.accession_versions)} sequences")
                
            finally:
                # Clean up temporary files
                temp_metadata.unlink(missing_ok=True)
                temp_sequences.unlink(missing_ok=True)
        
        # Summarize results
        total_revised = sum(len(result.accession_versions) for result in all_results)
        total_warnings = sum(len(result.warnings) for result in all_results)
        total_errors = sum(len(result.errors) for result in all_results)
        
        console.print(f"\n✓ Batch revision completed!")
        console.print(f"Total sequences revised: {total_revised}")
        
        if total_warnings > 0:
            console.print(f"Total warnings: {total_warnings}")
        
        if total_errors > 0:
            console.print(f"Total errors: {total_errors}")
            console.print("\nCheck individual batch results for details")
        
    except click.ClickException:
        raise
    except Exception as e:
        console.print(f"[bold red]✗ Batch revision failed:[/bold red] {e}")
        raise click.ClickException(str(e))
    finally:
        backend_client.close()