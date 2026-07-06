import dataclasses
from collections import UserString
from dataclasses import dataclass
from enum import StrEnum
from typing import Self, overload


class XmlNone(UserString):
    pass


class LookupStrEnum(StrEnum):
    """StrEnum with case-insensitive lookup by ENA's controlled-vocabulary value."""

    @overload
    @classmethod
    def from_value(cls, raw_value: str | None) -> Self | None: ...
    @overload
    @classmethod
    def from_value(cls, raw_value: str | None, default: Self) -> Self: ...

    @classmethod
    def from_value(cls, raw_value: str | None, default: Self | None = None) -> Self | None:
        if not raw_value:
            return default
        normalized = raw_value.strip().lower()
        for member in cls:
            if member.value.lower() == normalized:
                return member
        return default


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


class Instrument(LookupStrEnum):
    HiSeq_X_Five = "HiSeq X Five"
    HiSeq_X_Ten = "HiSeq X Ten"
    Illumina_Genome_Analyzer = "Illumina Genome Analyzer"
    Illumina_Genome_Analyzer_II = "Illumina Genome Analyzer II"
    Illumina_Genome_Analyzer_IIx = "Illumina Genome Analyzer IIx"
    Illumina_HiScanSQ = "Illumina HiScanSQ"
    Illumina_HiSeq_1000 = "Illumina HiSeq 1000"
    Illumina_HiSeq_1500 = "Illumina HiSeq 1500"
    Illumina_HiSeq_2000 = "Illumina HiSeq 2000"
    Illumina_HiSeq_2500 = "Illumina HiSeq 2500"
    Illumina_HiSeq_3000 = "Illumina HiSeq 3000"
    Illumina_HiSeq_4000 = "Illumina HiSeq 4000"
    Illumina_HiSeq_X = "Illumina HiSeq X"
    Illumina_iSeq_100 = "Illumina iSeq 100"
    Illumina_MiSeq = "Illumina MiSeq"
    Illumina_MiniSeq = "Illumina MiniSeq"
    Illumina_NovaSeq_6000 = "Illumina NovaSeq 6000"
    Illumina_NovaSeq_X = "Illumina NovaSeq X"
    Illumina_NovaSeq_X_Plus = "Illumina NovaSeq X Plus"
    NextSeq_500 = "NextSeq 500"
    NextSeq_550 = "NextSeq 550"
    NextSeq_1000 = "NextSeq 1000"
    NextSeq_2000 = "NextSeq 2000"
    MinION = "MinION"
    GridION = "GridION"
    PromethION = "PromethION"
    Onso = "Onso"
    PacBio_RS = "PacBio RS"
    PacBio_RS_II = "PacBio RS II"
    Revio = "Revio"
    Sequel = "Sequel"
    Sequel_II = "Sequel II"
    Sequel_IIe = "Sequel IIe"
    BGISEQ_50 = "BGISEQ-50"
    BGISEQ_500 = "BGISEQ-500"
    MGISEQ_2000RS = "MGISEQ-2000RS"
    GS_454 = "454 GS"
    GS_454_20 = "454 GS 20"
    GS_454_FLX = "454 GS FLX"
    GS_454_FLX_Plus = "454 GS FLX+"
    GS_454_FLX_Titanium = "454 GS FLX Titanium"
    GS_454_Junior = "454 GS Junior"
    Ion_Torrent_Genexus = "Ion Torrent Genexus"
    Ion_Torrent_PGM = "Ion Torrent PGM"
    Ion_Torrent_Proton = "Ion Torrent Proton"
    Ion_Torrent_S5 = "Ion Torrent S5"
    Ion_Torrent_S5_XL = "Ion Torrent S5 XL"
    Ion_GeneStudio_S5 = "Ion GeneStudio S5"
    Ion_GeneStudio_S5_Plus = "Ion GeneStudio S5 Plus"
    Ion_GeneStudio_S5_Prime = "Ion GeneStudio S5 Prime"
    AB_3730xL_Genetic_Analyzer = "AB 3730xL Genetic Analyzer"
    AB_3730_Genetic_Analyzer = "AB 3730 Genetic Analyzer"
    AB_3500xL_Genetic_Analyzer = "AB 3500xL Genetic Analyzer"
    AB_3500_Genetic_Analyzer = "AB 3500 Genetic Analyzer"
    AB_3130xL_Genetic_Analyzer = "AB 3130xL Genetic Analyzer"
    AB_3130_Genetic_Analyzer = "AB 3130 Genetic Analyzer"
    AB_310_Genetic_Analyzer = "AB 310 Genetic Analyzer"
    DNBSEQ_T7 = "DNBSEQ-T7"
    DNBSEQ_G400 = "DNBSEQ-G400"
    DNBSEQ_G50 = "DNBSEQ-G50"
    DNBSEQ_G400_FAST = "DNBSEQ-G400 FAST"
    DNBSEQ_T10x4RS = "DNBSEQ-T10x4RS"
    Element_AVITI = "Element AVITI"
    UG_100 = "UG 100"
    Sentosa_SQ301 = "Sentosa SQ301"
    GENIUS = "GENIUS"
    Genapsys_Sequencer = "Genapsys Sequencer"
    GS111 = "GS111"
    GenoCare_1600 = "GenoCare 1600"
    GenoLab_M = "GenoLab M"
    FASTASeq_300 = "FASTASeq 300"
    Tapestri = "Tapestri"
    unspecified = "unspecified"
    AVITI_24 = "AVITI 24"


class Platform(LookupStrEnum):
    ILLUMINA = "ILLUMINA"
    PACBIO_SMRT = "PACBIO_SMRT"
    OXFORD_NANOPORE = "OXFORD_NANOPORE"
    BGISEQ = "BGISEQ"
    LS454 = "LS454"
    ION_TORRENT = "ION_TORRENT"
    CAPILLARY = "CAPILLARY"
    DNBSEQ = "DNBSEQ"
    ELEMENT = "ELEMENT"
    ULTIMA = "ULTIMA"
    VELA_DIAGNOSTICS = "VELA_DIAGNOSTICS"
    GENAPSYS = "GENAPSYS"
    GENEMIND = "GENEMIND"
    TAPESTRI = "TAPESTRI"
    AVITI = "AVITI"


class LibrarySource(LookupStrEnum):
    GENOMIC = "GENOMIC"
    GENOMIC_SINGLE_CELL = "GENOMIC SINGLE CELL"
    TRANSCRIPTOMIC = "TRANSCRIPTOMIC"
    TRANSCRIPTOMIC_SINGLE_CELL = "TRANSCRIPTOMIC SINGLE CELL"
    METAGENOMIC = "METAGENOMIC"
    METATRANSCRIPTOMIC = "METATRANSCRIPTOMIC"
    SYNTHETIC = "SYNTHETIC"
    VIRAL_RNA = "VIRAL RNA"
    OTHER = "OTHER"


class LibrarySelection(LookupStrEnum):
    RANDOM = "RANDOM"
    PCR = "PCR"
    RANDOM_PCR = "RANDOM PCR"
    RT_PCR = "RT-PCR"
    HMPR = "HMPR"
    MF = "MF"
    REPEAT_FRACTIONATION = "repeat fractionation"
    SIZE_FRACTIONATION = "size fractionation"
    MSLL = "MSLL"
    CDNA = "cDNA"
    CDNA_RANDOM_PRIMING = "cDNA_randomPriming"
    CDNA_OLIGO_DT = "cDNA_oligo_dT"
    POLYA = "PolyA"
    OLIGO_DT = "Oligo-dT"
    INVERSE_RRNA = "Inverse rRNA"
    INVERSE_RRNA_SELECTION = "Inverse rRNA selection"
    CHIP = "ChIP"
    CHIP_SEQ = "ChIP-Seq"
    MNASE = "MNase"
    DNASE = "DNase"
    HYBRID_SELECTION = "Hybrid Selection"
    REDUCED_REPRESENTATION = "Reduced Representation"
    RESTRICTION_DIGEST = "Restriction Digest"
    METHYLCYTIDINE_ANTIBODY = "5-methylcytidine antibody"
    MBD2_PROTEIN_METHYL_CPG_BINDING_DOMAIN = "MBD2 protein methyl-CpG binding domain"
    CAGE = "CAGE"
    RACE = "RACE"
    MDA = "MDA"
    PADLOCK_PROBES_CAPTURE_METHOD = "padlock probes capture method"
    OTHER = "other"
    UNSPECIFIED = "unspecified"


class LibraryStrategy(LookupStrEnum):
    WGS = "WGS"
    WGA = "WGA"
    WXS = "WXS"
    RNA_SEQ = "RNA-Seq"
    SSRNA_SEQ = "ssRNA-seq"
    SNRNA_SEQ = "snRNA-seq"
    MIRNA_SEQ = "miRNA-Seq"
    NCRNA_SEQ = "ncRNA-Seq"
    FL_CDNA = "FL-cDNA"
    EST = "EST"
    HI_C = "Hi-C"
    ATAC_SEQ = "ATAC-seq"
    WCS = "WCS"
    RAD_SEQ = "RAD-Seq"
    CLONE = "CLONE"
    POOLCLONE = "POOLCLONE"
    AMPLICON = "AMPLICON"
    CLONEEND = "CLONEEND"
    FINISHING = "FINISHING"
    CHIP_SEQ = "ChIP-Seq"
    MNASE_SEQ = "MNase-Seq"
    DNASE_HYPERSENSITIVITY = "DNase-Hypersensitivity"
    BISULFITE_SEQ = "Bisulfite-Seq"
    CTS = "CTS"
    MRE_SEQ = "MRE-Seq"
    MEDIP_SEQ = "MeDIP-Seq"
    MBD_SEQ = "MBD-Seq"
    TN_SEQ = "Tn-Seq"
    VALIDATION = "VALIDATION"
    FAIRE_SEQ = "FAIRE-seq"
    SELEX = "SELEX"
    RIP_SEQ = "RIP-Seq"
    CHIA_PET = "ChIA-PET"
    SYNTHETIC_LONG_READ = "Synthetic-Long-Read"
    TARGETED_CAPTURE = "Targeted-Capture"
    TETHERED_CHROMATIN_CONFORMATION_CAPTURE = "Tethered Chromatin Conformation Capture"
    NOME_SEQ = "NOMe-seq"
    CHM_SEQ = "ChM-Seq"
    GBS = "GBS"
    RIBO_SEQ = "Ribo-seq"
    OTHER = "OTHER"


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


@dataclass
class RawReadsManifest:
    study: str
    sample: str
    name: str
    fastq: list[str]
    platform: Platform | None = None
    instrument: Instrument = Instrument.unspecified
    insert_size: int | None = None
    library_name: str | None = None
    library_source: LibrarySource = LibrarySource.OTHER
    library_selection: LibrarySelection = LibrarySelection.UNSPECIFIED
    library_strategy: LibraryStrategy = LibraryStrategy.OTHER
    description: str | None = None
    address: str | None = None
    authors: str | None = None


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
