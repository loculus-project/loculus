# Config Processor

This is a simple image that is used to "process" many of the config maps produced by kubernetes. It simply mounts them as an input volume and writes them over to an output volume, but at the same time it scans all files for the text `[[URL:...]]`, e.g. `[[URL:https://mywebsite.com/mysequence.txt]]`. Where it finds that pattern it downloads the file from this URL and replaces the `[[URL:...]]` with the contents of the file. This allows us to deal with large reference genomes. 
