import dataclasses
from dataclasses import dataclass, field
from enum import Enum


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


def default_sequencing_project() -> SequencingProject:
    return SequencingProject()


@dataclass
class SubmissionProject:
    sequencing_project: SequencingProject = field(default_factory=default_sequencing_project)
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
class XmlAttribute:
    def __init__(self, name):
        self.name = name

    def __str__(self):
        return self.name


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


def default_project_type():
    return ProjectType(
        name="default_name", title="default_title", description="default_description"
    )


@dataclass
class ProjectSet:
    project: list[ProjectType]


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
    sample_attribute: list[SampleAttribute] = None


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


class AssemblyType(Enum):
    CLONE = "clone"
    ISOLATE = "isolate"

    def __str__(self):
        return self.value


class MoleculeType(Enum):
    GENOMIC_DNA = "genomic DNA"
    GENOMIC_RNA = "genomic RNA"
    VIRAL_CRNA = "viral cRNA"

    def __str__(self):
        return self.value


@dataclass
class AssemblyManifest:
    study: str
    sample: str
    assemblyname: str  # Note: this SHOULD be 1 word no hyphen
    assembly_type: AssemblyType
    coverage: str
    program: str
    platform: str
    chromosome_list: str
    fasta: str | None = None
    flatfile: str | None = None
    mingaplength: int | None = None
    moleculetype: MoleculeType | None = None
    description: str | None = None
    run_ref: list[str] | None = None
    address: str | None = None
    authors: str | None = None


class ChromosomeType(Enum):
    CHROMOSOME = "chromosome"
    PLASMID = "plasmid"
    LINKAGE_GROUP = "linkage_group"
    MONOPARTITE = "monopartite"
    SEGMENTED = "segmented"
    MULTIPARTITE = "multipartite"

    def __str__(self):
        return self.value


class ChromosomeLocation(Enum):
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

    def __str__(self):
        return self.value


class Topology(Enum):
    LINEAR = "linear"
    CIRCULAR = "circular"

    def __str__(self):
        return self.value


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


@dataclass
class Actions:
    action: list[Action]

@dataclass
class Submission:
    actions: Actions
