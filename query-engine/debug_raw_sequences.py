import requests
import json

# Test the unaligned sequences endpoint with JSON format to see raw data
url = 'http://localhost:8081/ebola-sudan/sample/unalignedNucleotideSequences'
params = {'dataFormat': 'JSON', 'limit': 1}

response = requests.get(url, params=params)
print("=== JSON Sequences Response ===")
print(f'Status: {response.status_code}')
if response.status_code == 200:
    if response.text:
        try:
            data = response.json()
            print(f"Response type: {type(data)}")
            print(f"Response: {data}")
        except json.JSONDecodeError as e:
            print(f"JSON decode error: {e}")
            print(f"Raw response: {response.text[:500]}")
    else:
        print("Empty response")
else:
    print(f"Error: {response.text}")

print("\n" + "="*50)

# Now test FASTA to see if we get the same empty result
params['dataFormat'] = 'FASTA'
response = requests.get(url, params=params)
print("=== FASTA Sequences Response ===")
print(f'Status: {response.status_code}')
print(f'Content length: {len(response.text)}')
if response.text:
    print(f"Content: {repr(response.text[:200])}")
else:
    print("Empty content")