import os
import re
import shutil
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

DEFAULT_MAX_WORKERS = 16
thread_local = threading.local()


def copy_structure(input_dir, output_dir):
    for root, dirs, files in os.walk(input_dir):
        for dir in dirs:
            dir_path = os.path.join(output_dir, os.path.relpath(os.path.join(root, dir), input_dir))
            os.makedirs(dir_path, exist_ok=True)
        for file in files:
            file_path = os.path.join(output_dir, os.path.relpath(os.path.join(root, file), input_dir))
            # Make sure the directory exists
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            shutil.copy(os.path.join(root, file), file_path)


def download_urls(urls):
    if not urls:
        return {}

    max_workers = DEFAULT_MAX_WORKERS
    while True:
        try:
            return download_urls_with_workers(urls, max_workers)
        except requests.exceptions.RequestException as error:
            if "Too many open files" not in str(error) or max_workers == 1:
                raise
            max_workers = max(max_workers // 2, 1)
            print(f"Too many open files while downloading URLs, retrying with {max_workers} worker(s)")


def download_urls_with_workers(urls, max_workers):
    print(f"Downloading {len(urls)} unique URL(s) with {max_workers} worker(s)")

    downloaded_content = {}
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_url = {executor.submit(download_url, url): url for url in urls}
        for future in as_completed(future_to_url):
            url = future_to_url[future]
            response = future.result()
            if response.status_code == 200:
                downloaded_content[url] = response.text.strip()
            else:
                error_details = f"URL: {url}, Status Code: {response.status_code}, Reason: {response.reason}"
                raise ValueError(f"Problem downloading {error_details}")
    return downloaded_content


def download_url(url):
    if not hasattr(thread_local, "session"):
        thread_local.session = requests.Session()
    return thread_local.session.get(url)


def replace_url_with_content(file_content, downloaded_content):
    urls = re.findall(r'\[\[URL:([^\]]*)\]\]', file_content)
    for url in set(urls):
        file_content = file_content.replace(f"[[URL:{url}]]", downloaded_content[url])
    return file_content

def make_substitutions(file_content, substitutions):
    for key, value in substitutions.items():
        file_content = file_content.replace(f"[[{key}]]", value)
    return file_content

def collect_urls(output_dir):
    urls = set()
    for root, dirs, files in os.walk(output_dir):
        for file in files:
            file_path = os.path.join(root, file)
            with open(file_path) as f:
                urls.update(re.findall(r'\[\[URL:([^\]]*)\]\]', f.read()))
    return urls

def process_files(output_dir, substitutions):
    downloaded_content = download_urls(collect_urls(output_dir))
    for root, dirs, files in os.walk(output_dir):
        for file in files:
            file_path = os.path.join(root, file)
            with open(file_path, 'r+') as f:
                print(f"Processing {file_path}")
                content = f.read()
                new_content = replace_url_with_content(content, downloaded_content)
                new_content = make_substitutions(new_content, substitutions)
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
    

    substitutions = {}
    for var in os.environ:
        sub_start = "LOCULUSSUB_"
        if var.startswith(sub_start):
            key = var[len(sub_start):]
            value = os.environ[var]
            substitutions[key] = value
    main(input_dir, output_dir, substitutions)
