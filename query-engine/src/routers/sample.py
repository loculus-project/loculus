"""Sample endpoints - main LAPIS API compatibility layer"""

from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Query, Path, Response
from fastapi.responses import PlainTextResponse
import json
import logging
import csv
import io
import base64
import gzip
import bz2
import lzma
try:
    import zstandard as zstd
    HAS_ZSTD = True
except ImportError:
    HAS_ZSTD = False

try:
    from ..models import (
        LapisBaseRequest, 
        MutationsRequest, 
        SequenceRequest,
        LapisResponse,
        MutationsResponse,
        InsertionsResponse,
        AggregatedResponse,
        LineageDefinition,
        Info
    )
    from ..database import execute_query
    from ..query_builder import QueryBuilder
    from ..compression_manager import get_compression_service
except ImportError:
    from models import (
        LapisBaseRequest, 
        MutationsRequest, 
        SequenceRequest,
        LapisResponse,
        MutationsResponse,
        InsertionsResponse,
        AggregatedResponse,
        LineageDefinition,
        Info
    )
    from database import execute_query
    from query_builder import QueryBuilder
    from compression_manager import get_compression_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/details")
async def get_details_post(
    request: LapisBaseRequest,
    organism: str = Path(..., description="Organism name")
):
    """Get detailed sequence metadata"""
    return await _get_details_impl(request, organism)


@router.get("/details")
async def get_details_get(
    organism: str = Path(..., description="Organism name"),
    limit: Optional[int] = Query(10, description="Maximum number of results"),
    offset: Optional[int] = Query(None, description="Number of results to skip"),
    fields: Optional[str] = Query(None, description="Comma-separated list of fields to return"),
    orderBy: Optional[str] = Query(None, description="Field to order by"),
    dataFormat: Optional[str] = Query("JSON", description="Data format")
):
    """Get detailed sequence metadata (GET version for browser testing)"""
    # Convert query parameters to request object
    request_data = {"limit": limit, "dataFormat": dataFormat}
    if offset is not None:
        request_data["offset"] = offset
    if fields:
        request_data["fields"] = [f.strip() for f in fields.split(",")]
    if orderBy:
        request_data["orderBy"] = [{"field": orderBy, "type": "ascending"}]
    
    request = LapisBaseRequest(**request_data)
    return await _get_details_impl(request, organism)


async def _get_details_impl(request: LapisBaseRequest, organism: str):
    """Implementation for detailed sequence metadata"""
    try:
        query_builder = QueryBuilder(organism)
        query, params = query_builder.build_details_query(request)
        
        logger.info(f"Executing details query: {query}")
        logger.info(f"With params: {params}")
        
        results = await execute_query(query, tuple(params))
        
        # Process results to handle JSONB fields properly
        processed_results = []
        for row in results:
            processed_row = {}
            for key, value in row.items():
                if key == 'metadata':
                    # Parse and flatten metadata JSONB
                    if isinstance(value, str):
                        try:
                            metadata_dict = json.loads(value)
                            if isinstance(metadata_dict, dict) and 'metadata' in metadata_dict:
                                # Extract the nested metadata
                                inner_metadata = metadata_dict['metadata']
                                if isinstance(inner_metadata, dict):
                                    processed_row.update(inner_metadata)
                            elif isinstance(metadata_dict, dict):
                                # Direct metadata dict
                                processed_row.update(metadata_dict)
                        except (json.JSONDecodeError, TypeError):
                            pass
                    elif isinstance(value, dict):
                        # Already parsed JSONB
                        if 'metadata' in value:
                            inner_metadata = value['metadata']
                            if isinstance(inner_metadata, dict):
                                processed_row.update(inner_metadata)
                        else:
                            processed_row.update(value)
                else:
                    processed_row[key] = value
            processed_results.append(processed_row)
        
        # Filter fields if specific fields were requested
        if request.fields:
            filtered_results = []
            for row in processed_results:
                filtered_row = {}
                for field in request.fields:
                    if field in row:
                        filtered_row[field] = row[field]
                filtered_results.append(filtered_row)
            processed_results = filtered_results
        
        # Check if TSV format is requested
        if hasattr(request, 'dataFormat') and getattr(request, 'dataFormat') == 'TSV':
            # Convert to TSV format
            tsv_content = _convert_to_tsv(processed_results)
            return PlainTextResponse(content=tsv_content, media_type="text/tab-separated-values")
        
        return LapisResponse(
            data=processed_results,
            info=Info()
        )
    
    except Exception as e:
        logger.error(f"Error in get_details: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/aggregated")
async def get_aggregated_post(
    request: LapisBaseRequest,
    organism: str = Path(..., description="Organism name")
) -> AggregatedResponse:
    """Get aggregated counts"""
    return await _get_aggregated_impl(request, organism)


@router.get("/aggregated")
async def get_aggregated_get(
    organism: str = Path(..., description="Organism name"),
    fields: Optional[str] = Query(None, description="Comma-separated list of fields to group by"),
    limit: Optional[int] = Query(None, description="Maximum number of results"),
    offset: Optional[int] = Query(None, description="Number of results to skip")
) -> AggregatedResponse:
    """Get aggregated counts (GET version for browser testing)"""
    # Convert query parameters to request object
    request_data = {}
    if fields:
        request_data["fields"] = [f.strip() for f in fields.split(",")]
    if limit is not None:
        request_data["limit"] = limit
    if offset is not None:
        request_data["offset"] = offset
    
    request = LapisBaseRequest(**request_data)
    return await _get_aggregated_impl(request, organism)


async def _get_aggregated_impl(request: LapisBaseRequest, organism: str) -> AggregatedResponse:
    """Implementation for aggregated counts"""
    try:
        query_builder = QueryBuilder(organism)
        query, params = query_builder.build_aggregated_query(request)
        
        logger.info(f"Executing aggregated query: {query}")
        
        results = await execute_query(query, tuple(params))
        
        return AggregatedResponse(
            data=results,
            info=Info()
        )
    
    except Exception as e:
        logger.error(f"Error in get_aggregated: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/nucleotideMutations")
async def get_nucleotide_mutations_post(
    request: MutationsRequest,
    organism: str = Path(..., description="Organism name")
) -> MutationsResponse:
    """Get nucleotide mutations"""
    return await _get_mutations_impl(request, organism, "nucleotide")


@router.get("/nucleotideMutations")
async def get_nucleotide_mutations_get(
    organism: str = Path(..., description="Organism name"),
    limit: Optional[int] = Query(10, description="Maximum number of results"),
    offset: Optional[int] = Query(None, description="Number of results to skip"),
    minProportion: Optional[float] = Query(None, description="Minimum proportion threshold")
) -> MutationsResponse:
    """Get nucleotide mutations (GET version for browser testing)"""
    request_data = {"limit": limit}
    if offset is not None:
        request_data["offset"] = offset
    if minProportion is not None:
        request_data["minProportion"] = minProportion
    
    request = MutationsRequest(**request_data)
    return await _get_mutations_impl(request, organism, "nucleotide")


async def _get_mutations_impl(request: MutationsRequest, organism: str, mutation_type: str) -> MutationsResponse:
    """Implementation for mutations"""
    try:
        query_builder = QueryBuilder(organism)
        query, params = query_builder.build_mutations_query(request, mutation_type)
        
        results = await execute_query(query, tuple(params))
        
        return MutationsResponse(
            data=results,
            info=Info()
        )
    
    except Exception as e:
        logger.error(f"Error in get_mutations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/aminoAcidMutations")
async def get_amino_acid_mutations_post(
    request: MutationsRequest,
    organism: str = Path(..., description="Organism name")
) -> MutationsResponse:
    """Get amino acid mutations"""
    return await _get_mutations_impl(request, organism, "aminoAcid")


@router.get("/aminoAcidMutations")
async def get_amino_acid_mutations_get(
    organism: str = Path(..., description="Organism name"),
    limit: Optional[int] = Query(10, description="Maximum number of results"),
    offset: Optional[int] = Query(None, description="Number of results to skip"),
    minProportion: Optional[float] = Query(None, description="Minimum proportion threshold")
) -> MutationsResponse:
    """Get amino acid mutations (GET version for browser testing)"""
    request_data = {"limit": limit}
    if offset is not None:
        request_data["offset"] = offset
    if minProportion is not None:
        request_data["minProportion"] = minProportion
    
    request = MutationsRequest(**request_data)
    return await _get_mutations_impl(request, organism, "aminoAcid")


@router.post("/nucleotideInsertions")
async def get_nucleotide_insertions(
    request: LapisBaseRequest,
    organism: str = Path(..., description="Organism name")
) -> InsertionsResponse:
    """Get nucleotide insertions"""
    try:
        query_builder = QueryBuilder(organism)
        query, params = query_builder.build_insertions_query(request, "nucleotide")
        
        results = await execute_query(query, tuple(params))
        
        return InsertionsResponse(
            data=results,
            info=Info()
        )
    
    except Exception as e:
        logger.error(f"Error in get_nucleotide_insertions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/aminoAcidInsertions")
async def get_amino_acid_insertions(
    request: LapisBaseRequest,
    organism: str = Path(..., description="Organism name")
) -> InsertionsResponse:
    """Get amino acid insertions"""
    try:
        query_builder = QueryBuilder(organism)
        query, params = query_builder.build_insertions_query(request, "aminoAcid")
        
        results = await execute_query(query, tuple(params))
        
        return InsertionsResponse(
            data=results,
            info=Info()
        )
    
    except Exception as e:
        logger.error(f"Error in get_amino_acid_insertions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/unalignedNucleotideSequences")
async def get_unaligned_sequences(
    request: SequenceRequest,
    organism: str = Path(..., description="Organism name")
) -> Response:
    """Get unaligned nucleotide sequences"""
    try:
        query_builder = QueryBuilder(organism)
        
        # Modify request to include sequence data fields
        sequence_request = LapisBaseRequest(**request.dict())
        if not sequence_request.fields:
            sequence_request.fields = ['accession', 'version']
        
        # Get sequence metadata first
        query, params = query_builder.build_details_query(sequence_request)
        results = await execute_query(query, tuple(params))
        
        if request.dataFormat == "FASTA":
            # Query the processed_data for actual sequences
            fasta_content = await _get_sequences_as_fasta(results, organism, "unalignedNucleotideSequences")
            return PlainTextResponse(content=fasta_content, media_type="text/plain")
        
        elif request.dataFormat in ["JSON", "NDJSON"]:
            # Return sequence data as JSON
            sequence_data = await _get_sequences_as_json(results, organism, "unalignedNucleotideSequences")
            if request.dataFormat == "JSON":
                return Response(content=json.dumps(sequence_data), media_type="application/json")
            else:  # NDJSON
                ndjson_lines = [json.dumps(item) for item in sequence_data]
                return PlainTextResponse(content="\n".join(ndjson_lines), media_type="application/x-ndjson")
        
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported data format: {request.dataFormat}")
    
    except Exception as e:
        logger.error(f"Error in get_unaligned_sequences: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/unalignedNucleotideSequences")
async def get_unaligned_sequences_get(
    organism: str = Path(..., description="Organism name"),
    dataFormat: str = Query("FASTA", description="Data format (FASTA, JSON, NDJSON)"),
    limit: Optional[int] = Query(10, description="Maximum number of results"),
    offset: Optional[int] = Query(None, description="Number of results to skip"),
    fields: Optional[str] = Query(None, description="Comma-separated list of fields"),
    downloadAsFile: Optional[bool] = Query(False, description="Download as file attachment"),
    downloadFileBasename: Optional[str] = Query(None, description="Base filename for download"),
    dataUseTerms: Optional[str] = Query(None, description="Filter by data use terms"),
    versionStatus: Optional[str] = Query(None, description="Filter by version status"),
    isRevocation: Optional[bool] = Query(None, description="Filter revocations")
) -> Response:
    """Get unaligned nucleotide sequences (GET version for browser testing)"""
    # Convert query parameters to request object
    request_data = {"dataFormat": dataFormat, "limit": limit}
    if offset is not None:
        request_data["offset"] = offset
    if fields:
        request_data["fields"] = [f.strip() for f in fields.split(",")]
    
    # Add filter parameters
    if dataUseTerms is not None:
        request_data["dataUseTerms"] = dataUseTerms
    if versionStatus is not None:
        request_data["versionStatus"] = versionStatus  
    if isRevocation is not None:
        request_data["isRevocation"] = isRevocation
    
    request = SequenceRequest(**request_data)
    response = await get_unaligned_sequences(request, organism)
    
    # Handle file download headers
    if downloadAsFile and isinstance(response, PlainTextResponse):
        filename = downloadFileBasename or f"{organism}_sequences"
        if dataFormat.upper() == "FASTA":
            filename += ".fasta"
        elif dataFormat.upper() == "JSON":
            filename += ".json"
        elif dataFormat.upper() == "NDJSON":
            filename += ".ndjson"
        
        response.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
        response.headers["Content-Type"] = "application/octet-stream"
    
    return response


@router.post("/unalignedNucleotideSequences/{segment}")
async def get_unaligned_sequences_segment(
    request: SequenceRequest,
    organism: str = Path(..., description="Organism name"),
    segment: str = Path(..., description="Segment name")
) -> Response:
    """Get unaligned nucleotide sequences for a specific segment"""
    # For multi-segment organisms, we'd need to extract the specific segment
    # For now, delegate to the main sequence endpoint
    # TODO: Implement segment-specific sequence extraction
    logger.info(f"Requested segment: {segment} for organism: {organism}")
    return await get_unaligned_sequences(request, organism)


@router.post("/alignedNucleotideSequences")
async def get_aligned_sequences(
    request: SequenceRequest,
    organism: str = Path(..., description="Organism name")
) -> Response:
    """Get aligned nucleotide sequences"""
    try:
        query_builder = QueryBuilder(organism)
        
        # Modify request to include sequence data fields
        sequence_request = LapisBaseRequest(**request.dict())
        if not sequence_request.fields:
            sequence_request.fields = ['accession', 'version']
        
        # Get sequence metadata first
        query, params = query_builder.build_details_query(sequence_request)
        results = await execute_query(query, tuple(params))
        
        if request.dataFormat == "FASTA":
            # Query the processed_data for aligned sequences
            fasta_content = await _get_sequences_as_fasta(results, organism, "alignedNucleotideSequences")
            return PlainTextResponse(content=fasta_content, media_type="text/plain")
        
        elif request.dataFormat in ["JSON", "NDJSON"]:
            # Return sequence data as JSON
            sequence_data = await _get_sequences_as_json(results, organism, "alignedNucleotideSequences")
            if request.dataFormat == "JSON":
                return Response(content=json.dumps(sequence_data), media_type="application/json")
            else:  # NDJSON
                ndjson_lines = [json.dumps(item) for item in sequence_data]
                return PlainTextResponse(content="\n".join(ndjson_lines), media_type="application/x-ndjson")
        
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported data format: {request.dataFormat}")
    
    except Exception as e:
        logger.error(f"Error in get_aligned_sequences: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/alignedNucleotideSequences/{segment}")
async def get_aligned_sequences_segment(
    request: SequenceRequest,
    organism: str = Path(..., description="Organism name"),
    segment: str = Path(..., description="Segment name")
) -> Response:
    """Get aligned nucleotide sequences for a specific segment"""
    # TODO: Implement segment-specific aligned sequence extraction
    logger.info(f"Requested segment: {segment} for organism: {organism}")
    return await get_aligned_sequences(request, organism)


@router.post("/alignedAminoAcidSequences/{gene}")
async def get_aligned_amino_acid_sequences(
    request: SequenceRequest,
    organism: str = Path(..., description="Organism name"),
    gene: str = Path(..., description="Gene name")
) -> Response:
    """Get aligned amino acid sequences for a specific gene"""
    try:
        query_builder = QueryBuilder(organism)
        
        # Modify request to include sequence data fields
        sequence_request = LapisBaseRequest(**request.dict())
        if not sequence_request.fields:
            sequence_request.fields = ['accession', 'version']
        
        # Get sequence metadata first
        query, params = query_builder.build_details_query(sequence_request)
        results = await execute_query(query, tuple(params))
        
        if request.dataFormat == "FASTA":
            # Query the processed_data for amino acid sequences for specific gene
            fasta_content = await _get_gene_sequences_as_fasta(results, organism, gene)
            return PlainTextResponse(content=fasta_content, media_type="text/plain")
        
        elif request.dataFormat in ["JSON", "NDJSON"]:
            # Return sequence data as JSON
            sequence_data = await _get_gene_sequences_as_json(results, organism, gene)
            if request.dataFormat == "JSON":
                return Response(content=json.dumps(sequence_data), media_type="application/json")
            else:  # NDJSON
                ndjson_lines = [json.dumps(item) for item in sequence_data]
                return PlainTextResponse(content="\n".join(ndjson_lines), media_type="application/x-ndjson")
        
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported data format: {request.dataFormat}")
    
    except Exception as e:
        logger.error(f"Error in get_aligned_amino_acid_sequences: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/lineageDefinition/{column}")
async def get_lineage_definition(
    organism: str = Path(..., description="Organism name"),
    column: str = Path(..., description="Column name")
) -> LineageDefinition:
    """Get lineage definition for a specific column"""
    # This would typically be loaded from a config file or database
    # TODO: Implement lineage definition loading
    logger.info(f"Requested lineage definition for column: {column} in organism: {organism}")
    return {}


async def _get_sequences_as_fasta(results: List[Dict[str, Any]], organism: str, sequence_type: str = "unalignedNucleotideSequences") -> str:
    """Extract sequences from processed_data and format as FASTA"""
    fasta_lines = []
    
    for row in results:
        accession = row.get('accession', '')
        version = row.get('version', '')
        accession_version = f"{accession}.{version}"
        
        # Query for the actual sequence data
        sequence_query = f"""
        SELECT processed_data->'{sequence_type}' as sequences,
               joint_metadata->'metadata' as metadata
        FROM sequence_entries_view 
        WHERE accession = $1 AND version = $2 AND organism = $3
        """
        
        sequence_results = await execute_query(sequence_query, (accession, version, organism))
        
        if sequence_results and sequence_results[0]['sequences'] is not None:
            sequences = sequence_results[0]['sequences']
            logger.info(f"Retrieved sequences for {accession_version}: type={type(sequences)}")
            
            # If sequences is a string (shouldn't happen but handle it), try to parse as JSON
            if isinstance(sequences, str):
                try:
                    sequences = json.loads(sequences)
                    logger.info(f"Parsed string sequences as JSON for {accession_version}")
                except json.JSONDecodeError:
                    logger.warning(f"Failed to parse sequences string as JSON for {accession_version}")
                    continue
            
            # Handle different sequence storage formats
            if isinstance(sequences, dict):
                # Multi-segment organism or single sequence
                logger.info(f"Processing {len(sequences)} segments for {accession_version}: {list(sequences.keys())}")
                for segment_name, sequence_data in sequences.items():
                    extracted_sequence = None
                    logger.info(f"Processing segment '{segment_name}' for {accession_version}: type={type(sequence_data)}")
                    
                    # Skip null segments
                    if sequence_data is None:
                        logger.info(f"Skipping null segment '{segment_name}' for {accession_version}")
                        continue
                    
                    if isinstance(sequence_data, str) and sequence_data.strip():
                        # Direct sequence string
                        extracted_sequence = sequence_data.strip()
                    elif isinstance(sequence_data, dict):
                        # Sequence object - try different formats
                        if 'sequence' in sequence_data:
                            extracted_sequence = sequence_data['sequence']
                        elif 'compressedSequence' in sequence_data:
                            # Handle compressed sequence using compression service
                            logger.info(f"Found compressedSequence for {accession_version}:{segment_name}")
                            compressed_sequence = sequence_data['compressedSequence']
                            
                            compression_service = get_compression_service()
                            if compression_service:
                                try:
                                    extracted_sequence = compression_service.decompress_nucleotide_sequence(
                                        compressed_sequence, segment_name, organism
                                    )
                                    if extracted_sequence:
                                        logger.info(f"Successfully decompressed sequence for {accession_version}:{segment_name} (length: {len(extracted_sequence)})")
                                    else:
                                        logger.warning(f"Failed to decompress sequence for {accession_version}:{segment_name}")
                                        extracted_sequence = f"DECOMPRESSION_FAILED_{accession_version}_{segment_name}"
                                except Exception as e:
                                    logger.error(f"Error decompressing sequence for {accession_version}:{segment_name}: {e}")
                                    extracted_sequence = f"DECOMPRESSION_ERROR_{accession_version}_{segment_name}"
                            else:
                                logger.warning(f"Compression service not available for {accession_version}:{segment_name}")
                                extracted_sequence = f"COMPRESSION_SERVICE_UNAVAILABLE_{accession_version}_{segment_name}"
                    
                    if extracted_sequence and extracted_sequence.strip():
                        header = f">{accession_version}"
                        if segment_name not in ['main', 'sequence']:
                            header += f"_{segment_name}"
                        fasta_lines.append(header)
                        fasta_lines.append(extracted_sequence.strip())
            elif isinstance(sequences, str) and sequences.strip():
                # Single sequence string
                fasta_lines.append(f">{accession_version}")
                fasta_lines.append(sequences.strip())
            elif isinstance(sequences, list):
                # Array of sequences
                for i, seq in enumerate(sequences):
                    if isinstance(seq, dict):
                        seq_data = seq.get('sequence', '')
                        seq_name = seq.get('name', f"{accession_version}_{i}")
                    else:
                        seq_data = str(seq)
                        seq_name = f"{accession_version}_{i}"
                    
                    if seq_data and seq_data.strip():
                        fasta_lines.append(f">{seq_name}")
                        fasta_lines.append(seq_data.strip())
    
    return "\n".join(fasta_lines)


async def _get_sequences_as_json(results: List[Dict[str, Any]], organism: str, sequence_type: str = "unalignedNucleotideSequences") -> List[Dict[str, Any]]:
    """Extract sequences and format as JSON"""
    sequence_data = []
    
    for row in results:
        accession = row.get('accession', '')
        version = row.get('version', '')
        
        # Query for the actual sequence data
        sequence_query = f"""
        SELECT processed_data->'{sequence_type}' as sequences,
               joint_metadata->'metadata' as metadata
        FROM sequence_entries_view 
        WHERE accession = $1 AND version = $2 AND organism = $3
        """
        
        sequence_results = await execute_query(sequence_query, (accession, version, organism))
        
        if sequence_results:
            result = sequence_results[0]
            sequences = result.get('sequences', {})
            metadata = result.get('metadata', {})
            
            # Combine sequence and metadata
            entry = {
                'accession': accession,
                'version': version,
                'sequences': sequences,
                'metadata': metadata
            }
            sequence_data.append(entry)
    
    # Note: format_type parameter determines JSON vs NDJSON handling in caller
    return sequence_data


def _convert_to_tsv(data: List[Dict[str, Any]]) -> str:
    """Convert data to TSV format"""
    if not data:
        return ""
    
    # Get all unique field names
    field_names = set()
    for row in data:
        field_names.update(row.keys())
    
    # Sort field names for consistent output
    field_names = sorted(field_names)
    
    # Create TSV content
    lines = []
    
    # Header line
    lines.append("\t".join(field_names))
    
    # Data lines
    for row in data:
        values = []
        for field in field_names:
            value = row.get(field, "")
            # Convert None to empty string and escape tabs
            if value is None:
                value = ""
            else:
                value = str(value).replace("\t", " ")
            values.append(value)
        lines.append("\t".join(values))
    
    return "\n".join(lines)


async def _get_gene_sequences_as_fasta(results: List[Dict[str, Any]], organism: str, gene: str) -> str:
    """Extract amino acid sequences for a specific gene and format as FASTA"""
    fasta_lines = []
    
    for row in results:
        accession = row.get('accession', '')
        version = row.get('version', '')
        accession_version = f"{accession}.{version}"
        
        # Query for the actual amino acid sequence data for the specific gene
        sequence_query = """
        SELECT processed_data->'alignedAminoAcidSequences' as sequences
        FROM sequence_entries_view 
        WHERE accession = $1 AND version = $2 AND organism = $3
        """
        
        sequence_results = await execute_query(sequence_query, (accession, version, organism))
        
        if sequence_results and sequence_results[0]['sequences']:
            sequences = sequence_results[0]['sequences']
            
            # Extract sequence for the specific gene
            if isinstance(sequences, dict) and gene in sequences:
                gene_sequence = sequences[gene]
                if isinstance(gene_sequence, str) and gene_sequence.strip():
                    fasta_lines.append(f">{accession_version}_{gene}")
                    fasta_lines.append(gene_sequence.strip())
                elif isinstance(gene_sequence, dict) and 'sequence' in gene_sequence:
                    seq = gene_sequence['sequence']
                    if seq and seq.strip():
                        fasta_lines.append(f">{accession_version}_{gene}")
                        fasta_lines.append(seq.strip())
    
    return "\n".join(fasta_lines)


async def _get_gene_sequences_as_json(results: List[Dict[str, Any]], organism: str, gene: str) -> List[Dict[str, Any]]:
    """Extract amino acid sequences for a specific gene and format as JSON"""
    sequence_data = []
    
    for row in results:
        accession = row.get('accession', '')
        version = row.get('version', '')
        
        # Query for the actual amino acid sequence data for the specific gene
        sequence_query = """
        SELECT processed_data->'alignedAminoAcidSequences' as sequences,
               joint_metadata->'metadata' as metadata
        FROM sequence_entries_view 
        WHERE accession = $1 AND version = $2 AND organism = $3
        """
        
        sequence_results = await execute_query(sequence_query, (accession, version, organism))
        
        if sequence_results:
            result = sequence_results[0]
            sequences = result.get('sequences', {})
            metadata = result.get('metadata', {})
            
            # Extract sequence for the specific gene
            gene_sequence = None
            if isinstance(sequences, dict) and gene in sequences:
                gene_seq_data = sequences[gene]
                if isinstance(gene_seq_data, str):
                    gene_sequence = gene_seq_data
                elif isinstance(gene_seq_data, dict) and 'sequence' in gene_seq_data:
                    gene_sequence = gene_seq_data['sequence']
            
            if gene_sequence:
                entry = {
                    'accession': accession,
                    'version': version,
                    'gene': gene,
                    'sequence': gene_sequence,
                    'metadata': metadata
                }
                sequence_data.append(entry)
    
    return sequence_data


@router.get("/debug/sequences/{accession}")
async def debug_sequences(
    organism: str = Path(..., description="Organism name"),
    accession: str = Path(..., description="Accession to debug")
):
    """Debug endpoint to examine sequence decompression"""
    try:
        # Query for the actual sequence data
        sequence_query = f"""
        SELECT processed_data->'unalignedNucleotideSequences' as sequences
        FROM sequence_entries_view 
        WHERE accession = $1 AND organism = $2
        LIMIT 1
        """
        
        sequence_results = await execute_query(sequence_query, (accession, organism))
        
        if not sequence_results:
            return {"error": "No sequence found"}
        
        sequences = sequence_results[0]['sequences']
        debug_info = {
            "raw_type": str(type(sequences)),
            "raw_value_preview": str(sequences)[:200] if sequences else None,
            "has_zstd": HAS_ZSTD
        }
        
        if isinstance(sequences, str):
            try:
                parsed_sequences = json.loads(sequences)
                debug_info["parsed_successfully"] = True
                debug_info["parsed_type"] = str(type(parsed_sequences))
                debug_info["parsed_keys"] = list(parsed_sequences.keys()) if isinstance(parsed_sequences, dict) else None
                
                # Try to decompress
                if isinstance(parsed_sequences, dict):
                    for segment_name, sequence_data in parsed_sequences.items():
                        if sequence_data is None:
                            debug_info[f"{segment_name}_status"] = "null"
                        elif isinstance(sequence_data, dict) and 'compressedSequence' in sequence_data:
                            try:
                                compressed_data = sequence_data['compressedSequence']
                                decoded_data = base64.b64decode(compressed_data)
                                
                                # Try different compression formats
                                decompressed_sequence = None
                                compression_method = None
                                
                                # Try gzip first
                                try:
                                    decompressed_data = gzip.decompress(decoded_data)
                                    decompressed_sequence = decompressed_data.decode('utf-8')
                                    compression_method = "gzip"
                                except:
                                    pass
                                
                                # Try bzip2
                                if not decompressed_sequence:
                                    try:
                                        decompressed_data = bz2.decompress(decoded_data)
                                        decompressed_sequence = decompressed_data.decode('utf-8')
                                        compression_method = "bzip2"
                                    except:
                                        pass
                                
                                # Try lzma/xz
                                if not decompressed_sequence:
                                    try:
                                        decompressed_data = lzma.decompress(decoded_data)
                                        decompressed_sequence = decompressed_data.decode('utf-8')
                                        compression_method = "lzma"
                                    except:
                                        pass
                                
                                # Try zstd
                                if not decompressed_sequence and HAS_ZSTD:
                                    try:
                                        dctx = zstd.ZstdDecompressor()
                                        decompressed_data = dctx.decompress(decoded_data)
                                        decompressed_sequence = decompressed_data.decode('utf-8')
                                        compression_method = "zstd"
                                    except Exception as zstd_error:
                                        debug_info[f"{segment_name}_zstd_error"] = str(zstd_error)
                                
                                # Try raw data (maybe it's not compressed)
                                if not decompressed_sequence:
                                    try:
                                        decompressed_sequence = decoded_data.decode('utf-8')
                                        compression_method = "none"
                                    except:
                                        pass
                                
                                if decompressed_sequence:
                                    debug_info[f"{segment_name}_status"] = f"success with {compression_method}, length: {len(decompressed_sequence)}"
                                    debug_info[f"{segment_name}_preview"] = decompressed_sequence[:100]
                                else:
                                    debug_info[f"{segment_name}_status"] = f"all_decompression_methods_failed, magic_bytes: {decoded_data[:10]}"
                                    
                            except Exception as e:
                                debug_info[f"{segment_name}_status"] = f"base64_decode_failed: {e}"
                        else:
                            debug_info[f"{segment_name}_status"] = f"no_compressed_sequence, data_type: {type(sequence_data)}"
                            
            except json.JSONDecodeError as e:
                debug_info["parse_error"] = str(e)
        else:
            debug_info["not_string"] = True
            
        return debug_info
        
    except Exception as e:
        return {"error": str(e)}