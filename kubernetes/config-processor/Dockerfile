# Use an official Python runtime as a parent image
FROM python:3.8-slim

# Copy the dependencies file to the working directory
COPY requirements.txt ./

# Install any dependencies
RUN pip install --no-cache-dir -r requirements.txt


COPY config-processor.py ./

# Run the script when the container launches
ENTRYPOINT ["python", "./config-processor.py"]