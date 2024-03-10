import os
import shutil
import requests
import re

def copy_structure(input_dir, output_dir):
    for root, dirs, files in os.walk(input_dir):
        for dir in dirs:
            dir_path = os.path.join(output_dir, os.path.relpath(os.path.join(root, dir), input_dir))
            os.makedirs(dir_path, exist_ok=True)
        for file in files:
            file_path = os.path.join(output_dir, os.path.relpath(os.path.join(root, file), input_dir))
            shutil.copy(os.path.join(root, file), file_path)

def replace_url_with_content(file_content):
    urls = re.findall(r'\[\[URL:([^\]]*)\]\]', file_content)
    for url in set(urls):
        response = requests.get(url)
        if response.status_code == 200:
            file_content = file_content.replace(f"[[URL:{url}]]", response.text)
    return file_content

def make_substitutions(file_content, substitutions):
    for key, value in substitutions.items():
        file_content = file_content.replace(f"[[{key}]]", value)
    return file_content

def process_files(output_dir, substitutions):
    for root, dirs, files in os.walk(output_dir):
        for file in files:
            file_path = os.path.join(root, file)
            with open(file_path, 'r+') as f:
                print(f"Processing {file_path}")
                content = f.read()
                new_content = replace_url_with_content(content)
                new_content = make_substitutions(content, substitutions)
                if new_content != content:
                    f.seek(0)
                    f.write(new_content)
                    f.truncate()

def main(input_dir, output_dir, substitutions):
    print(f"Processing {input_dir} to {output_dir}")
    copy_structure(input_dir, output_dir)
    print(f"Copied directory structure from {input_dir} to {output_dir}")
    process_files(output_dir, substitutions)

if __name__ == "__main__":
    import sys
    input_dir = sys.argv[1]
    output_dir = sys.argv[2]
    substitution_args = sys.argv[3:]
    substitutions = {}
    for arg in substitution_args:
        key, value = arg.split("=")
        substitutions[key] = value
    main(input_dir, output_dir, substitutions)
