"""
Compression and decompression utilities for the query engine.
Implements the same logic as the backend CompressionService in Kotlin.
"""

import base64
import zstandard as zstd
import yaml
from typing import Optional, Dict, Any


class CompressionService:
    def __init__(self, config_path: str):
        """Initialize with reference genomes from config file."""
        with open(config_path, 'r') as f:
            self.config = yaml.safe_load(f)
        
        # Build reference genome dictionaries for each organism/segment
        self.reference_genomes = {}
        for organism_name, organism_config in self.config.get('organisms', {}).items():
            ref_genomes = organism_config.get('referenceGenomes', {})
            
            # Store nucleotide sequences
            nucleotide_sequences = ref_genomes.get('nucleotideSequences', [])
            for seq_info in nucleotide_sequences:
                segment_name = seq_info['name']
                sequence = seq_info['sequence']
                key = f"{organism_name}:{segment_name}"
                self.reference_genomes[key] = sequence.encode('utf-8')
            
            # Store gene sequences (amino acid)
            genes = ref_genomes.get('genes', [])
            for gene_info in genes:
                gene_name = gene_info['name']
                sequence = gene_info['sequence']
                key = f"{organism_name}:gene:{gene_name}"
                self.reference_genomes[key] = sequence.encode('utf-8')
    
    def decompress_nucleotide_sequence(
        self, 
        compressed_sequence: str, 
        segment_name: str, 
        organism: str
    ) -> Optional[str]:
        """Decompress a nucleotide sequence using the reference genome as dictionary."""
        dictionary_key = f"{organism}:{segment_name}"
        dictionary = self.reference_genomes.get(dictionary_key)
        
        if dictionary is None:
            print(f"Warning: No reference genome found for {organism}:{segment_name}")
            return None
        
        return self._decompress(compressed_sequence, dictionary)
    
    def decompress_amino_acid_sequence(
        self, 
        compressed_sequence: str, 
        gene_name: str, 
        organism: str
    ) -> Optional[str]:
        """Decompress an amino acid sequence using the gene reference as dictionary."""
        dictionary_key = f"{organism}:gene:{gene_name}"
        dictionary = self.reference_genomes.get(dictionary_key)
        
        if dictionary is None:
            print(f"Warning: No reference gene found for {organism}:gene:{gene_name}")
            return None
        
        return self._decompress(compressed_sequence, dictionary)
    
    def _decompress(self, compressed_sequence: str, dictionary: bytes) -> Optional[str]:
        """
        Decompress a base64-encoded zstd compressed sequence using a dictionary.
        
        This mirrors the backend CompressionService.decompress() method.
        """
        try:
            # Decode base64
            compressed_data = base64.b64decode(compressed_sequence)
            
            # Try decompression with dictionary first
            try:
                # Create a ZstdCompressionDict from the dictionary data
                zstd_dict = zstd.ZstdCompressionDict(dictionary)
                
                # Create decompressor with dictionary
                dctx = zstd.ZstdDecompressor(dict_data=zstd_dict)
                
                # Decompress
                decompressed_data = dctx.decompress(compressed_data)
                
                # Convert to string
                return decompressed_data.decode('utf-8')
                
            except Exception as dict_error:
                # Try without dictionary as fallback
                dctx = zstd.ZstdDecompressor()
                decompressed_data = dctx.decompress(compressed_data)
                return decompressed_data.decode('utf-8')
            
        except Exception as e:
            print(f"Decompression failed: {e}")
            return None
    
    def get_reference_sequence(self, organism: str, segment_name: str) -> Optional[str]:
        """Get the reference sequence for debugging purposes."""
        dictionary_key = f"{organism}:{segment_name}"
        reference_bytes = self.reference_genomes.get(dictionary_key)
        if reference_bytes:
            return reference_bytes.decode('utf-8')
        return None
    
    def list_available_references(self) -> Dict[str, Any]:
        """List all available reference genomes for debugging."""
        result = {}
        for organism_name, organism_config in self.config.get('organisms', {}).items():
            ref_genomes = organism_config.get('referenceGenomes', {})
            result[organism_name] = {
                'nucleotideSequences': [seq['name'] for seq in ref_genomes.get('nucleotideSequences', [])],
                'genes': [gene['name'] for gene in ref_genomes.get('genes', [])]
            }
        return result