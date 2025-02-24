---
# These are optional metadata elements. Feel free to remove any of them.
status: "proposed"
date: 2025-02-24
decision-makers: tbd
consulted: tbd
informed: tbd
---

# Raw data / file sharing

## Context and Problem Statement

Loculus is currently only able to share consensus sequences but not the raw reads. However, such data are of high value. In case of clinical samples where consensus sequences are available, raw data are useful for deeper analysis, validation of results, and the detection of low-frequency variants. In the case of environmental samples, such as those from wastewater, consensus sequences cannot be derived and raw data are the only way to analyze the sample.

The raw read data of a sample is significantly larger than a consensus sequence. For example, a consensus sequence of a SARS-CoV-2 sample is about 30 KB, while the raw data is around hundred MB to a few GB. We therefore need an approach to store and share large files.

From the user perspective, depending on the instance, it should be possible to upload metadata, consensus sequences and/or raw data. The consensus sequences are, as now, stored in a FASTA. The raw data can be a FASTQ, a BAM file or something else – what exactly one has/can upload depends also on the instance. The maintainer-configurable pipeline will take the user data and return processed data: this could be only consensus sequences and metadata (i.e., some tabular data), or include some other unaligned raw data (e.g., the raw reads after dehumanizing), aligned raw reads, or other type of files. The user will be able to download all processed data. Aligned reads may be passed into SILO for fast querying.


## Decision Drivers

* Scalability of storage size: The system should be able to scale to TBs or even PBs of data files.
* Scalability of traffic: The system should be able to handle the upload and download of large files.
* Same data privacy, integrity, and persistence model as before: This means that the data uploaded by a group should remain private until it has been approved. Once approved, it should be guaranteed that the originally uploaded data remain available and versioned (unless explicit interventions by a maintainer).


## Considered Options

### S3 and pre-signed URLs

- To upload files, the authenticated client first calls a new endpoint `/files/request-uploads`. The backend returns S3 pre-signed URLs to which the client uploads the files.
- When the client calls `/submit` (or `/revise`), they can provide in the metadata file in the column `files` the file IDs of the associated files.
- The backend will provide to the preprocessing pipeline pre-signed URLs to read the original files. If the pipeline would like to upload processed files, it calls the same `/files/request-uploads` endpoint.
- During the review, the user receives pre-signed URLs to download the original and processed files.

### S3 and (semi-)public write-only link

- Authenticated users can see on the website information to upload to files to a shared S3 bucket.
- They should choose a random object names to avoid conflicts with uploads of other users.
- They state the object name in the metadata file when they submit (or revise).

### User-controlled S3

- Users upload files to their own S3 bucket and give Loculus read access.


### Addon: File hashing

Every uploaded file will be hashed. If a file has been already uploaded before, it will not be uploaded again. Maybe, it is possible to get a hash from S3 directly (see https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity.html) but it has not been clarified whether this is widely supported by different S3 providers/software.

This can be combined with any of the other options.

## Decision Outcome

Chosen option: "{title of option 1}", because {justification. e.g., only option, which meets k.o. criterion decision driver | which resolves force {force} | … | comes out best (see below)}.

<!-- This is an optional element. Feel free to remove. -->
### Consequences

* Good, because {positive consequence, e.g., improvement of one or more desired qualities, …}
* Bad, because {negative consequence, e.g., compromising one or more desired qualities, …}
* … <!-- numbers of consequences can vary -->

<!-- This is an optional element. Feel free to remove. -->
### Confirmation

{Describe how the implementation / compliance of the ADR can/will be confirmed. Is there any automated or manual fitness function? If so, list it and explain how it is applied. Is the chosen design and its implementation in line with the decision? E.g., a design/code review or a test with a library such as ArchUnit can help validate this. Note that although we classify this element as optional, it is included in many ADRs.}

<!-- This is an optional element. Feel free to remove. -->
## Pros and Cons of the Options

### S3 and pre-signed URLs

* Good, because this gives the backend fine-grained control over the uploaded files:
  * It controls where files are uploaded to, avoiding users overwriting each other with certainty.
  * It can set a max file size for each file.
  * It can limit number of uploads (in total/within a time period/for a user/group/etc.) to limit the use of resources and potential for abuse
* Bad, because (compared to option "S3 and (semi-)public write-only link"), users need to call an additional endpoint to receive the pre-signed URLs.

### S3 and (semi-)public write-only link

* Good, because users don't need to call an additional endpoint to retrieve pre-signed URLs before each submission.
* Bad, because Loculus cannot impose limits on the amount of uploaded data.
* Bad, because once a user has the access information to write to the bucket, they keep their access even after their account has been removed/disabled. The only way to prevent a user from writing would be to change the access information which would affect all users.

### User-controlled S3

* Good, because if a user already maintain their data in a S3 (or a different public location?), they do not need to re-upload the files.
* Bad, because if a user does not have their data in a S3, they first need to set up an own S3.
* Bad, because Loculus needs to download data from an external source.
  * This might be vulnerable for abuses if users provide links to sources that they do not own.

### Addon: File hashing

* Good, because it saves storage if the same file is uploaded.
* (We need to clarify whether it is possible to get the hash directly from S3 or need to calculate it ourselves. The latter is bad, because Loculus backend needs to download the files from S3 to hash them which takes time and network traffic.)


<!-- This is an optional element. Feel free to remove. -->
## More Information

{You might want to provide additional evidence/confidence for the decision outcome here and/or document the team agreement on the decision and/or define when/how this decision the decision should be realized and if/when it should be re-visited. Links to other decisions and resources might appear here as well.}