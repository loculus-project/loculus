import dataclasses
from collections import UserString
from dataclasses import dataclass
from enum import StrEnum


class XmlNone(UserString):
    pass


@dataclass
class XmlAttribute:
    def __init__(self, name):
        self.name = name

    def __str__(self):
        return self.name


@dataclass
class XrefType:
    db: str | None = None
    id: str | None = None
    label: str | None = None


@dataclass
class UrlType:
    label: str | None = None
    url: str | None = None


@dataclass
class ProjectLink:
    xref_link: XrefType | None = None
    url_link: UrlType | None = None


@dataclass
class ProjectLinks:
    project_link: list[ProjectLink] | None = None


@dataclass
class OrganismType:
    taxon_id: int | None = None
    scientific_name: str | None = None
    common_name: str | None = None
    strain: str | None = None
    breed: str | None = None
    cultivar: str | None = None
    isolate: str | None = None


@dataclass
class SequencingProject:
    locus_tag_prefix: list[str] = dataclasses.field(default_factory=list)


@dataclass
class SubmissionProject:
    sequencing_project: SequencingProject | XmlNone = dataclasses.field(
        default_factory=lambda: XmlNone("")
    )
    organism: OrganismType | None = None


@dataclass
class UmbrellaProject:
    organism: OrganismType | None = None


@dataclass
class RelatedProjectSubType:
    accession: str | None = None


@dataclass
class RelatedProject:
    parent_project: RelatedProjectSubType | None = None
    child_project: RelatedProjectSubType | None = None
    peer_project: RelatedProjectSubType | None = None


@dataclass
class ProjectTypeCollaborators:
    collaborator: list[str]


@dataclass
class ProjectType:
    name: str
    title: str
    description: str
    center_name: XmlAttribute | None = None
    alias: XmlAttribute | None = None
    collaborators: ProjectTypeCollaborators | None = None
    submission_project: SubmissionProject | None = None
    umbrella_project: UmbrellaProject | None = None
    related_projects: RelatedProject | None = None
    project_links: ProjectLinks | None = None
    project_attributes: dict[str, str] | None = None


def default_project_type() -> ProjectType:
    return ProjectType(
        name="default_name", title="default_title", description="default_description"
    )


@dataclass
class ProjectSet:
    project: list[ProjectType]


def default_project_set() -> ProjectSet:
    return ProjectSet(project=[default_project_type()])


@dataclass
class SampleName:
    taxon_id: int | None = None
    scientific_name: str | None = None
    common_name: str | None = None
    display_name: str | None = None


@dataclass
class SampleAttribute:
    tag: str
    value: str
    units: str | None = None


@dataclass
class SampleAttributes:
    sample_attribute: list[SampleAttribute]


@dataclass
class SampleLinks:
    sample_link: list[ProjectLink]


@dataclass
class SampleType:
    center_name: XmlAttribute | None = None
    alias: XmlAttribute | None = None
    title: str | None = None
    sample_name: SampleName | None = None
    description: str | None = None
    sample_links: SampleLinks | None = None
    sample_attributes: SampleAttributes | None = None


def default_sample_type():
    return SampleType()


@dataclass
class SampleSetType:
    sample: list[SampleType]


def default_sample_set_type() -> SampleSetType:
    return SampleSetType(sample=[default_sample_type()])


class AssemblyType(StrEnum):
    CLONE = "clone"
    ISOLATE = "isolate"


class MoleculeType(StrEnum):
    GENOMIC_DNA = "genomic DNA"
    GENOMIC_RNA = "genomic RNA"
    VIRAL_CRNA = "viral cRNA"


@dataclass
class AssemblyManifest:
    study: str
    sample: str
    assemblyname: str  # Note: this SHOULD be 1 word no hyphen
    coverage: str
    program: str
    platform: str
    chromosome_list: str
    assembly_type: AssemblyType = AssemblyType.ISOLATE
    fasta: str | None = None
    flatfile: str | None = None
    mingaplength: int | None = None
    moleculetype: MoleculeType | None = None
    description: str | None = None
    run_ref: str | None = None
    address: str | None = None
    authors: str | None = None


class ChromosomeType(StrEnum):
    CHROMOSOME = "chromosome"
    PLASMID = "plasmid"
    LINKAGE_GROUP = "linkage_group"
    MONOPARTITE = "monopartite"
    SEGMENTED = "segmented"
    MULTIPARTITE = "multipartite"


class ChromosomeLocation(StrEnum):
    MACRONUCLEAR = "macronuclear"
    NUCLEOMORPH = "nucleomorph"
    MITOCHONDRION = "mitochondrion"
    KINETOPLAST = "kinetoplast"
    CHLOROPLAST = "chloroplast"
    CHROMOPLAST = "chromoplast"
    PLASTID = "plastid"
    VIRION = "virion"
    PHAGE = "phage"
    PROVIRAL = "proviral"
    PROPHAGE = "prophage"
    VIROID = "viroid"
    CYANELLE = "cyanelle"
    APICOPLAST = "apicoplast"
    LEUCOPLAST = "leucoplast"
    PROPLASTID = "proplastid"
    HYDROGENOSOME = "hydrogenosome"
    CHROMATOPHORE = "chromatophore"


class Topology(StrEnum):
    LINEAR = "linear"
    CIRCULAR = "circular"


@dataclass
class AssemblyChromosomeListFileObject:
    object_name: str
    chromosome_name: str
    chromosome_type: ChromosomeType
    topology: Topology = Topology.LINEAR
    chromosome_location: ChromosomeLocation | None = None


@dataclass
class AssemblyChromosomeListFile:
    chromosomes: list[AssemblyChromosomeListFileObject]


@dataclass
class Hold:
    HoldUntilDate: XmlAttribute | None = None


@dataclass
class Action:
    add: str | None = None
    hold: Hold | None = None
    modify: str | None = None


@dataclass
class Actions:
    action: list[Action]


@dataclass
class Submission:
    actions: Actions


@dataclass(frozen=True)
class EmblPropertyFields:
    country_property: str
    admin_level_properties: list[str]
    collection_date_property: str
    authors_property: str


DEFAULT_EMBL_PROPERTY_FIELDS = EmblPropertyFields(
    country_property="geoLocCountry",
    admin_level_properties=["geoLocAdmin1", "geoLocAdmin2", "geoLocCity", "geoLocSite"],
    collection_date_property="sampleCollectionDate",
    authors_property="authors",
)
