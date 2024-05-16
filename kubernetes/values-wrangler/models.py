#%%
# ruff: noqa: N815
from dataclasses import dataclass
from enum import StrEnum, unique

import yaml


@unique
class Type(StrEnum):
    STRING = "string"
    INTEGER = "int"
    FLOAT = "float"
    BOOLEAN = "boolean"
    DATE = "date"

@unique
class Position(StrEnum):
    FIRST = "first"
    LAST = "last"

@dataclass
class Metadata:
    name: str
    displayName: str
    type: Type
    ingest: str | bool

    def __init__(self, name: str, displayName: str = None, type: str=None, ingest: str | bool | None = None, **kwargs):
        self.name = name
        self.displayName = displayName
        self.type = Type(type)
        self.ingest = ingest


@dataclass
class ExtraInputFields:
    name: str
    displayName: str
    definition: str
    guidance: str
    position: Position

@dataclass
class Schema:
    metadata: list[Metadata]

@dataclass
class Document:
    schema: Schema
    extraInputFields: ExtraInputFields

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

with open("kubernetes/loculus/values.yaml") as f:
    data = yaml.safe_load(f)

d = data["defaultOrganisms"]["ebola-zaire"]["schema"]["metadata"]

metadata = [Metadata(**dd) for dd in d]

extras = [] #InputField(name=dd["name"], displayName=dd["displayName"], definition=dd["definition"], guidance=dd["guidance"]) for dd in data["defaultOrganisms"]["extraInputFields"]]

extra_fields = {
    "first": [ field for field in extras if field["position"] == "first"],
    "last": [ field for field in extras if field["position"] == "last"],
}

# construct InputFieldDocument

input_fields = []


for field in metadata:
    input_fields.append(InputField(name=field.name, displayName=field.displayName, definition="", guidance=""))

input_fields = extra_fields["first"] + metadata + extra_fields["last"]

with open("kubernetes/loculus/values-wrangler/input_fields.yaml", "w") as f:
    yaml.dump(InputFieldDocument(inputFields=input_fields), f)

# %%
