"""XML parsing and generation utilities for mock ENA server."""

import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Any, Dict, Optional


def parse_project_xml(xml_content: str) -> Dict[str, Any]:
    """Parse PROJECT XML submission.

    Args:
        xml_content: XML string containing PROJECT_SET

    Returns:
        Dictionary with project information
    """
    root = ET.fromstring(xml_content)

    # Find the PROJECT element
    project = root.find(".//PROJECT")
    if project is None:
        raise ValueError("No PROJECT element found in XML")

    result = {
        "alias": project.get("alias"),
        "title": None,
        "description": None,
        "taxon_id": None,
    }

    # Extract title
    title_elem = project.find(".//TITLE")
    if title_elem is not None:
        result["title"] = title_elem.text

    # Extract description
    desc_elem = project.find(".//DESCRIPTION")
    if desc_elem is not None:
        result["description"] = desc_elem.text

    # Extract taxon ID
    taxon_elem = project.find(".//TAXON_ID")
    if taxon_elem is not None:
        result["taxon_id"] = taxon_elem.text

    return result


def parse_sample_xml(xml_content: str) -> Dict[str, Any]:
    """Parse SAMPLE XML submission.

    Args:
        xml_content: XML string containing SAMPLE_SET

    Returns:
        Dictionary with sample information
    """
    root = ET.fromstring(xml_content)

    # Find the SAMPLE element
    sample = root.find(".//SAMPLE")
    if sample is None:
        raise ValueError("No SAMPLE element found in XML")

    result = {
        "alias": sample.get("alias"),
        "taxon_id": None,
        "scientific_name": None,
    }

    # Extract taxon ID
    taxon_elem = sample.find(".//TAXON_ID")
    if taxon_elem is not None:
        result["taxon_id"] = taxon_elem.text

    # Extract scientific name
    name_elem = sample.find(".//SCIENTIFIC_NAME")
    if name_elem is not None:
        result["scientific_name"] = name_elem.text

    return result


def parse_submission_xml(xml_content: str) -> Dict[str, Any]:
    """Parse SUBMISSION XML.

    Args:
        xml_content: XML string containing SUBMISSION

    Returns:
        Dictionary with submission information
    """
    root = ET.fromstring(xml_content)

    result = {
        "alias": root.get("alias"),
        "actions": [],
    }

    # Extract actions
    actions = root.find(".//ACTIONS")
    if actions is not None:
        for action in actions:
            result["actions"].append(action.tag)

    return result


def generate_project_receipt_xml(
    project_accession: str,
    project_alias: str,
    submission_accession: str,
    submission_alias: str,
    success: bool = True,
    is_test: bool = True
) -> str:
    """Generate ENA-style RECEIPT XML for project submission.

    Args:
        project_accession: Project accession (e.g., PRJEB000001)
        project_alias: Project alias from submission
        submission_accession: Submission accession (e.g., ERA-SUBMIT-...)
        submission_alias: Submission alias from submission
        success: Whether submission was successful
        is_test: Whether this is a test submission

    Returns:
        XML string in ENA RECEIPT format
    """
    receipt_date = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "+00:00"

    receipt = ET.Element("RECEIPT")
    receipt.set("receiptDate", receipt_date)
    receipt.set("submissionFile", "submission.xml")
    receipt.set("success", str(success).lower())

    # Add PROJECT element
    project = ET.SubElement(receipt, "PROJECT")
    project.set("accession", project_accession)
    project.set("alias", project_alias)
    project.set("status", "PRIVATE")

    # Add SUBMISSION element
    submission = ET.SubElement(receipt, "SUBMISSION")
    submission.set("accession", submission_accession)
    submission.set("alias", submission_alias)

    # Add MESSAGES
    messages = ET.SubElement(receipt, "MESSAGES")
    if is_test:
        info = ET.SubElement(messages, "INFO")
        info.text = "This submission is a TEST submission and will be discarded within 24 hours"

    # Add ACTIONS
    actions = ET.SubElement(receipt, "ACTIONS")
    actions.text = "ADD"

    return ET.tostring(receipt, encoding="unicode", method="xml")


def generate_sample_receipt_xml(
    sample_accession: str,
    biosample_accession: str,
    sample_alias: str,
    submission_accession: str,
    submission_alias: str,
    success: bool = True,
    is_test: bool = True
) -> str:
    """Generate ENA-style RECEIPT XML for sample submission.

    Args:
        sample_accession: Sample accession (e.g., ERS0000001)
        biosample_accession: BioSample accession (e.g., SAMEA0000001)
        sample_alias: Sample alias from submission
        submission_accession: Submission accession
        submission_alias: Submission alias
        success: Whether submission was successful
        is_test: Whether this is a test submission

    Returns:
        XML string in ENA RECEIPT format
    """
    receipt_date = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "+00:00"

    receipt = ET.Element("RECEIPT")
    receipt.set("receiptDate", receipt_date)
    receipt.set("submissionFile", "submission.xml")
    receipt.set("success", str(success).lower())

    # Add SAMPLE element
    sample = ET.SubElement(receipt, "SAMPLE")
    sample.set("accession", sample_accession)
    sample.set("alias", sample_alias)
    sample.set("status", "PRIVATE")

    # Add EXT_ID for biosample
    ext_id = ET.SubElement(sample, "EXT_ID")
    ext_id.set("accession", biosample_accession)
    ext_id.set("type", "biosample")

    # Add SUBMISSION element
    submission = ET.SubElement(receipt, "SUBMISSION")
    submission.set("accession", submission_accession)
    submission.set("alias", submission_alias)

    # Add MESSAGES
    messages = ET.SubElement(receipt, "MESSAGES")
    if is_test:
        info = ET.SubElement(messages, "INFO")
        info.text = "This submission is a TEST submission and will be discarded within 24 hours"

    # Add ACTIONS
    actions = ET.SubElement(receipt, "ACTIONS")
    actions.text = "ADD"

    return ET.tostring(receipt, encoding="unicode", method="xml")


def generate_error_receipt_xml(error_message: str) -> str:
    """Generate ENA-style error RECEIPT XML.

    Args:
        error_message: Error message to include

    Returns:
        XML string in ENA RECEIPT format with error
    """
    receipt_date = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "+00:00"

    receipt = ET.Element("RECEIPT")
    receipt.set("receiptDate", receipt_date)
    receipt.set("submissionFile", "submission.xml")
    receipt.set("success", "false")

    # Add MESSAGES with error
    messages = ET.SubElement(receipt, "MESSAGES")
    error = ET.SubElement(messages, "ERROR")
    error.text = error_message

    return ET.tostring(receipt, encoding="unicode", method="xml")


def generate_assembly_report_xml(
    erz_accession: str,
    gca_accession: Optional[str],
    status: str
) -> str:
    """Generate ENA-style assembly processing report XML.

    Args:
        erz_accession: ERZ accession
        gca_accession: GCA accession (if available)
        status: Processing status (PENDING, PROCESSING, COMPLETED, ERROR)

    Returns:
        XML string with assembly report
    """
    root = ET.Element("ASSEMBLY_REPORT")

    assembly = ET.SubElement(root, "ASSEMBLY")
    assembly.set("accession", erz_accession)
    assembly.set("status", status)

    if gca_accession and status == "COMPLETED":
        ext_id = ET.SubElement(assembly, "EXT_ID")
        ext_id.set("accession", gca_accession)
        ext_id.set("type", "insdc")

    return ET.tostring(root, encoding="unicode", method="xml")
