import requests
import json

# Test what the details endpoint returns first
url = 'http://localhost:8081/ebola-sudan/sample/details'
params = {'limit': 1, 'fields': 'accession,version'}

response = requests.get(url, params=params)
print("=== Details Response ===")
print(f'Status: {response.status_code}')
if response.status_code == 200:
    data = response.json()
    print(f"Number of records: {len(data['data'])}")
    if data['data']:
        record = data['data'][0]
        print(f"Sample record: {record}")
    else:
        print("No data returned")
else:
    print(f"Error: {response.text}")

print("\n" + "="*50)

# Now test what the aggregated endpoint returns to see if we have any data at all
url = 'http://localhost:8081/ebola-sudan/sample/aggregated'
response = requests.get(url)
print("=== Aggregated Response ===")
print(f'Status: {response.status_code}')
if response.status_code == 200:
    data = response.json()
    print(f"Aggregated data: {data}")
else:
    print(f"Error: {response.text}")