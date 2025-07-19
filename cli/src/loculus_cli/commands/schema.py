"""Schema discovery commands for Loculus CLI."""

import click
from rich.console import Console
from rich.table import Table

from ..config import get_instance_config
from ..utils.guards import require_instance, require_organism

console = Console()


@click.group(name="schema")
def schema_group() -> None:
    """Schema discovery commands."""
    pass


@schema_group.command()
@click.pass_context
def organisms(ctx: click.Context) -> None:
    """List available organisms."""
    instance = require_instance(ctx, ctx.obj.get("instance"))
    instance_config = get_instance_config(instance)

    try:
        organisms = instance_config.get_organisms()
        version_info = instance_config.instance_info.get_version_info()

        console.print(f"[bold]Available organisms on {version_info['title']}:[/bold]")
        console.print()

        for organism in sorted(organisms):
            console.print(f"  • {organism}")

        console.print()
        console.print(
            "[dim]Use 'loculus schema show --organism <name>' "
            "to see metadata fields[/dim]"
        )

    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        raise click.ClickException(str(e)) from e


@schema_group.command()
@click.pass_context
def show(ctx: click.Context) -> None:
    """Show metadata schema for organism."""
    instance = require_instance(ctx, ctx.obj.get("instance"))
    instance_config = get_instance_config(instance)

    # Get organism with default (required for schema)
    organism = require_organism(instance, ctx.obj.get("organism"))

    try:
        schema = instance_config.get_organism_schema(organism)

        console.print(f"[bold]Metadata schema for {organism}:[/bold]")
        console.print(f"Organism: {schema['organismName']}")
        console.print(f"Primary key: {schema['primaryKey']}")
        console.print()

        # Show metadata fields
        metadata_fields = schema["metadata"]

        # Create table
        table = Table(title="Available Metadata Fields")
        table.add_column("Field Name", style="cyan", no_wrap=True)
        table.add_column("Type", style="magenta")
        table.add_column("Display Name", style="green")
        table.add_column("Searchable", style="yellow")
        table.add_column("Description", style="dim")

        searchable_fields = []
        for field in metadata_fields:
            searchable = "No" if field.get("notSearchable") else "Yes"
            if searchable == "Yes":
                searchable_fields.append(field["name"])

            display_name = field.get("displayName", field["name"])
            description = ""

            # Add range search info
            if field.get("rangeSearch"):
                description += "Range searchable (use >=, <=)"

            # Add autocomplete info
            if field.get("autocomplete"):
                if description:
                    description += ", "
                description += "Autocomplete available"

            table.add_row(
                field["name"], field["type"], display_name, searchable, description
            )

        console.print(table)
        console.print()

        # Show usage examples
        console.print("[bold]Filter Examples:[/bold]")

        # Pick a few example fields for demonstrations
        example_fields = []
        for field in metadata_fields[:5]:  # Show first 5 fields as examples
            if not field.get("notSearchable"):
                field_name = field["name"]
                field_type = field["type"]

                if field_type in ["string"]:
                    example_fields.append(f"--filter {field_name}=value")
                elif field_type in ["int", "float"]:
                    example_fields.append(f"--filter {field_name}>=100")
                elif field_type in ["date"]:
                    example_fields.append(f"--filter {field_name}>=2024-01-01")

        for example in example_fields[:3]:  # Show max 3 examples
            console.print(f"  loculus get sequences --organism {organism} {example}")

        console.print()
        console.print(f"[dim]Total searchable fields: {len(searchable_fields)}[/dim]")

    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        raise click.ClickException(str(e)) from e


@schema_group.command()
@click.option("--field", help="Show details for specific field")
@click.pass_context
def fields(ctx: click.Context, field: str | None = None) -> None:
    """Show detailed field information."""
    instance = require_instance(ctx, ctx.obj.get("instance"))
    instance_config = get_instance_config(instance)

    # Get organism with default (required for schema)
    organism = require_organism(instance, ctx.obj.get("organism"))

    try:
        schema = instance_config.get_organism_schema(organism)
        metadata_fields = schema["metadata"]

        if field:
            # Show details for specific field
            field_info = None
            for f in metadata_fields:
                if f["name"] == field:
                    field_info = f
                    break

            if not field_info:
                available = [f["name"] for f in metadata_fields]
                console.print(f"[red]Field '{field}' not found.[/red]")
                console.print(f"Available fields: {', '.join(available[:10])}...")
                return

            console.print(f"[bold]Field: {field_info['name']}[/bold]")
            console.print(f"Type: {field_info['type']}")
            console.print(
                f"Display Name: {field_info.get('displayName', field_info['name'])}"
            )
            console.print(
                f"Searchable: {'No' if field_info.get('notSearchable') else 'Yes'}"
            )

            if field_info.get("rangeSearch"):
                console.print("Range Search: Yes (supports >=, <= operators)")

            if field_info.get("autocomplete"):
                console.print("Autocomplete: Yes")

            if field_info.get("substringSearch"):
                console.print("Substring Search: Yes")

            if field_info.get("header"):
                console.print(f"Category: {field_info['header']}")

        else:
            # Show searchable fields only
            [f["name"] for f in metadata_fields if not f.get("notSearchable")]
            console.print(f"[bold]Searchable fields for {organism}:[/bold]")

            # Group by category
            by_category: dict[str, list[str]] = {}
            for f in metadata_fields:
                if not f.get("notSearchable"):
                    category = f.get("header", "Other")
                    if category not in by_category:
                        by_category[category] = []
                    by_category[category].append(f["name"])

            for category, fields in sorted(by_category.items()):
                console.print(f"\n[bold cyan]{category}:[/bold cyan]")
                for field_name in sorted(fields):
                    console.print(f"  {field_name}")

    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        raise click.ClickException(str(e)) from e
