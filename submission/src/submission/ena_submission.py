import random
from collections import defaultdict

import requests
import xmltodict
from requests.auth import HTTPBasicAuth


def recursive_defaultdict():
    return defaultdict(recursive_defaultdict)

def get_submission_dict():
    submission = recursive_defaultdict()
    submission["SUBMISSION_SET"]["SUBMISSION"]["ACTIONS"]["ACTION"]["ADD"] = None
    return submission

def create_project(config):
    def get_project_xml(alias, title, description, center_name):
        submission_set = get_submission_dict()
        project_set = recursive_defaultdict()
        project = {
            "@alias": f"{alias}{random.randint(1000, 9999)}",
            "TITLE": title,
            "DESCRIPTION": description,
            "SUBMISSION_PROJECT": {"SEQUENCING_PROJECT": None},
        }
        project_set["PROJECT_SET"]["PROJECT"] = project
        webin = {"WEBIN": {**submission_set, **project_set}}
        return xmltodict.unparse(webin, pretty=True)

    xml = get_project_xml("aliasTBD", "titleTBD", "descriptionTBD", "centerTBD")
    response = post_webin(xml, config)
    return response

def create_sample(config):
    def get_sample_xml(alias, taxon_id, scientific_name, attributes):
        submission_set = get_submission_dict()
        sample_set = recursive_defaultdict()
        sample = {
            "@alias": f"{alias}{random.randint(1000, 9999)}",
            "TITLE": "titleTBD",
            "SAMPLE_NAME": {
                "TAXON_ID": taxon_id,
                "SCIENTIFIC_NAME": scientific_name,
                "COMMON_NAME": None,
            },
            "SAMPLE_ATTRIBUTES": {
                "SAMPLE_ATTRIBUTE": [
                    {"TAG": key, "VALUE": value} for key, value in attributes.items()
                ]
            },
        }
        sample_set["SAMPLE_SET"]["SAMPLE"] = sample
        webin = {"WEBIN": {**submission_set, **sample_set}}
        return xmltodict.unparse(webin, pretty=True)

    xml = get_sample_xml("aliasTBD", 1284369, "nameTBD", {
        "collection date": "not collected",
        "geographic location (country and/or sea)": "not collected",
        "ENA-CHECKLIST": "ERC000011",
    })
    response = post_webin(xml, config)
    return response

def create_assembly(config):
    # Your code for create_assembly would go here
    pass

def post_webin(xml, config):
    headers = {"Accept": "application/xml", "Content-Type": "application/xml"}
    response = requests.post(
        config.url,
        auth=HTTPBasicAuth(config.username, config.password),
        data=xml,
        headers=headers,
    )
    if response.status_code == 200:
        return xmltodict.parse(response.text)
    else:
        raise Exception("Error:", response.status_code, response.text)
