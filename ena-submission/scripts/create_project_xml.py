group_accession = "group1"
Institution = "bla"
db = "Pathoplexus"
organism = "ebola-zaire"
ncbi_virus_name = "Zaire ebolavirus"
taxon_id = 186538

final_project_xml = f"""
<PROJECT_SET>
    <PROJECT alias="{group_accession}:{organism}">
        <NAME>{ncbi_virus_name}</NAME>
        <TITLE>{ncbi_virus_name} Genome sequencing</TITLE>
        <DESCRIPTION>Automated upload of {ncbi_virus_name} sequences submitted by {Institution} from {db}.</DESCRIPTION>
        <SUBMISSION_PROJECT>
            <SEQUENCING_PROJECT/>
            <ORGANISM>
            <TAXON_ID>{taxon_id}</TAXON_ID>
            <SCIENTIFIC_NAME>{ncbi_virus_name}</SCIENTIFIC_NAME>
            </ORGANISM>
        </SUBMISSION_PROJECT>
        <PROJECT_LINKS>
            <PROJECT_LINK>
                <XREF_LINK>
                <DB>{db}</DB>
                <ID>{group_accession}</ID>
                </XREF_LINK>
            </PROJECT_LINK>
        </PROJECT_LINKS>
    </PROJECT>
    </PROJECT_SET>
"""
