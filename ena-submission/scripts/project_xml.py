"""
Turns submitter.yaml into project.xml

Usage:
python3 scripts/project_xml.py {input} {output}
"""

import yaml
import xml.etree.ElementTree as ET

def yaml_to_xml(input_file, output_file):
    with open(input_file, 'r') as f:
        data = yaml.safe_load(f)

    root = ET.Element('PROJECT_SET')
    project = ET.SubElement(root, 'PROJECT', alias=data['alias'], center_name=data['center_name'])
    
    for key in ['title', 'description']:
        if key in data:
            sub_elem = ET.SubElement(project, key.upper())
            sub_elem.text = data[key]
    
    if "collaborators" in data:
        collaborators = ET.SubElement(project, 'COLLABORATORS')
        for collaborator in data['collaborators']:
            sub_elem = ET.SubElement(collaborators, 'COLLABORATOR')
            sub_elem.text = collaborator
    
    submission_project = ET.SubElement(project, 'SUBMISSION_PROJECT')
    ET.SubElement(submission_project, 'SEQUENCING_PROJECT')
    
    tree = ET.ElementTree(root)
    ET.indent(tree)
    tree.write(output_file)

if __name__ == "__main__":
    import sys
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    yaml_to_xml(input_file, output_file)