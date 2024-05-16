# %%
# ruff: noqa: N815
from dataclasses import asdict, dataclass
from enum import StrEnum, unique

import yaml


@unique
class Position(StrEnum):
    FIRST = "first"
    LAST = "last"


@dataclass
class Metadata:
    name: str
    displayName: str
    type: str
    ingest: str | bool

    def __init__(
        self,
        name: str,
        displayName: str = None,
        type: str = None,
        ingest: str | bool | None = None,
        **kwargs,
    ):
        self.name = name
        self.displayName = displayName
        self.type = type
        self.ingest = ingest


@dataclass
class ExtraInputField:
    name: str
    displayName: str
    definition: str
    guidance: str
    position: str


@dataclass
class Schema:
    metadata: list[Metadata]


@dataclass
class Document:
    schema: Schema
    extraInputFields: list[ExtraInputField]


@dataclass
class InputField:
    name: str
    displayName: str
    definition: str
    guidance: str


@dataclass
class InputFieldDocument:
    inputFields: list[InputField]


###

# Load input data
# Transform
# Output

######
# Schema to input fields
######

with open("kubernetes/loculus/values.yaml") as f:
    data = yaml.safe_load(f)

metadata = data["defaultOrganisms"]["ebola-zaire"]["schema"]["metadata"]

fields = []

TO_KEEP = ["name", "displayName", "definition", "guidance"]

for field in metadata:
    to_add = {k: v for k, v in field.items() if k in TO_KEEP}
    fields.append(to_add)

extra_fields = data["defaultOrganisms"]["ebola-zaire"]["extraInputFields"]

first = [field for field in extra_fields if field["position"] == "first"]
last = [field for field in extra_fields if field["position"] == "last"]

input_fields = first + fields + last

with open("kubernetes/values-wrangler/input_fields.yaml", "w") as f:
    yaml.dump(asdict(InputFieldDocument(inputFields=input_fields)), f)

# %%

#####
# Schema to Ingest mapping
#####

# Only need to look into remapping

ingest_remap = {
    field["ingest"]: field["name"] for field in metadata if "ingest" in field
}

with open("kubernetes/values-wrangler/ingest_remap.yaml", "w") as f:
    yaml.dump({"rename": ingest_remap}, f)
# %%


#####
# Schema to preprocessing config
#####

