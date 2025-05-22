"""SQL query builder for converting LAPIS requests to PostgreSQL queries"""

import json
from typing import Dict, Any, List, Optional, Tuple
try:
    from .models import LapisBaseRequest, OrderBy, OrderType
except ImportError:
    from models import LapisBaseRequest, OrderBy, OrderType


class QueryBuilder:
    """Builds PostgreSQL queries from LAPIS request parameters"""
    
    def __init__(self, organism: str):
        self.organism = organism
        self.base_table = "sequence_entries_view"
    
    def build_details_query(self, request: LapisBaseRequest) -> Tuple[str, List[Any]]:
        """Build query for /sample/details endpoint"""
        
        # Base SELECT clause
        if request.fields:
            # Always select basic fields and metadata, then filter in post-processing
            select_fields = []
            has_non_basic_fields = False
            for field in request.fields:
                if field in ['accession', 'version']:
                    select_fields.append(field)
                elif field == 'accessionVersion':
                    select_fields.append("(accession || '.' || version) as accessionVersion")
                else:
                    has_non_basic_fields = True
            
            if has_non_basic_fields:
                # Include metadata for post-processing
                select_fields.append("joint_metadata as metadata")
            
            select_clause = f"SELECT {', '.join(select_fields)}"
        else:
            # Select all available fields
            select_clause = """
            SELECT 
                accession,
                version,
                (accession || '.' || version) as accessionVersion,
                organism,
                submitter,
                group_id,
                submitted_at,
                released_at,
                is_revocation,
                status,
                joint_metadata as metadata
            """
        
        # WHERE clause
        where_conditions, params = self._build_where_conditions(request)
        # Filter to organism and only released sequences by default
        where_clause = f"WHERE organism = ${len(params) + 1} AND released_at IS NOT NULL"
        params.append(self.organism)
        
        if where_conditions:
            where_clause += f" AND ({' AND '.join(where_conditions)})"
        
        # ORDER BY clause
        order_clause = self._build_order_clause(request.orderBy) if request.orderBy else ""
        
        # LIMIT and OFFSET
        limit_clause = ""
        if request.limit is not None:
            limit_clause += f" LIMIT ${len(params) + 1}"
            params.append(request.limit)
        if request.offset is not None:
            limit_clause += f" OFFSET ${len(params) + 1}"
            params.append(request.offset)
        
        query = f"""
        {select_clause}
        FROM {self.base_table}
        {where_clause}
        {order_clause}
        {limit_clause}
        """
        
        return query.strip(), params
    
    def build_aggregated_query(self, request: LapisBaseRequest) -> Tuple[str, List[Any]]:
        """Build query for /sample/aggregated endpoint"""
        
        # Determine grouping fields
        group_fields = []
        select_fields = ["COUNT(*) as count"]
        
        if request.fields:
            for field in request.fields:
                if field in ['accession', 'version', 'organism', 'submitter', 'group_id', 'status']:
                    group_fields.append(field)
                    select_fields.append(field)
                elif field == 'accessionVersion':
                    group_fields.extend(['accession', 'version'])
                    select_fields.append("(accession || '.' || version) as accessionVersion")
                else:
                    # Metadata field
                    metadata_field = f"(joint_metadata->'metadata'->>{self._quote_literal(field)})"
                    group_fields.append(metadata_field)
                    select_fields.append(f"{metadata_field} as {self._quote_identifier(field)}")
        
        select_clause = f"SELECT {', '.join(select_fields)}"
        
        # WHERE clause
        where_conditions, params = self._build_where_conditions(request)
        # Filter to organism and only released sequences by default
        where_clause = f"WHERE organism = ${len(params) + 1} AND released_at IS NOT NULL"
        params.append(self.organism)
        
        if where_conditions:
            where_clause += f" AND ({' AND '.join(where_conditions)})"
        
        # GROUP BY clause
        group_clause = ""
        if group_fields:
            group_clause = f"GROUP BY {', '.join(group_fields)}"
        
        # ORDER BY clause
        order_clause = self._build_order_clause(request.orderBy) if request.orderBy else ""
        
        # LIMIT and OFFSET
        limit_clause = ""
        if request.limit is not None:
            limit_clause += f" LIMIT ${len(params) + 1}"
            params.append(request.limit)
        if request.offset is not None:
            limit_clause += f" OFFSET ${len(params) + 1}"
            params.append(request.offset)
        
        query = f"""
        {select_clause}
        FROM {self.base_table}
        {where_clause}
        {group_clause}
        {order_clause}
        {limit_clause}
        """
        
        return query.strip(), params
    
    def build_mutations_query(self, request: LapisBaseRequest, mutation_type: str) -> Tuple[str, List[Any]]:
        """Build query for mutations endpoints (nucleotide/aminoAcid)"""
        
        # Base WHERE conditions from request
        where_conditions, params = self._build_where_conditions(request)
        
        # Filter to organism and only released sequences by default
        where_clause = f"WHERE organism = ${len(params) + 1} AND released_at IS NOT NULL"
        params.append(self.organism)
        
        if where_conditions:
            where_clause += f" AND ({' AND '.join(where_conditions)})"
        
        # Determine the mutation field path in processed_data
        if mutation_type == "nucleotide":
            mutation_path = "nucleotideMutations"
        else:  # aminoAcid
            mutation_path = "aminoAcidMutations"
        
        # Build query to extract mutations from processed_data JSONB
        # The mutations are typically stored as arrays of objects in processed_data
        query = f"""
        WITH mutation_data AS (
            SELECT 
                jsonb_array_elements(processed_data->'{mutation_path}') as mutation_obj
            FROM {self.base_table}
            {where_clause}
        ),
        parsed_mutations AS (
            SELECT 
                mutation_obj->>'mutation' as mutation,
                COALESCE((mutation_obj->>'count')::int, 0) as count,
                COALESCE((mutation_obj->>'coverage')::int, 1) as coverage,
                COALESCE((mutation_obj->>'proportion')::float, 0.0) as proportion,
                COALESCE(mutation_obj->>'sequenceName', '') as sequenceName,
                COALESCE(mutation_obj->>'mutationFrom', '') as mutationFrom,
                COALESCE(mutation_obj->>'mutationTo', '') as mutationTo,
                COALESCE((mutation_obj->>'position')::int, 0) as position
            FROM mutation_data
            WHERE mutation_obj IS NOT NULL
        ),
        aggregated_mutations AS (
            SELECT 
                mutation,
                SUM(count) as count,
                SUM(coverage) as coverage,
                CASE 
                    WHEN SUM(coverage) > 0 THEN SUM(count)::float / SUM(coverage)::float
                    ELSE 0.0
                END as proportion,
                sequenceName,
                mutationFrom,
                mutationTo,
                position
            FROM parsed_mutations
            WHERE mutation IS NOT NULL AND mutation != ''
            GROUP BY mutation, sequenceName, mutationFrom, mutationTo, position
        )
        SELECT 
            mutation,
            count,
            coverage,
            proportion,
            sequenceName,
            mutationFrom,
            mutationTo,
            position
        FROM aggregated_mutations
        """
        
        # Add minimum proportion filter if specified
        if hasattr(request, 'minProportion') and request.minProportion is not None:
            query += f" WHERE proportion >= ${len(params) + 1}"
            params.append(request.minProportion)
        
        # Add ordering and limits
        query += " ORDER BY proportion DESC, count DESC"
        
        if request.limit is not None:
            query += f" LIMIT ${len(params) + 1}"
            params.append(request.limit)
        if request.offset is not None:
            query += f" OFFSET ${len(params) + 1}"
            params.append(request.offset)
        
        return query.strip(), params
    
    def build_insertions_query(self, request: LapisBaseRequest, insertion_type: str) -> Tuple[str, List[Any]]:
        """Build query for insertions endpoints"""
        
        # Base WHERE conditions from request
        where_conditions, params = self._build_where_conditions(request)
        
        # Filter to organism and only released sequences by default
        where_clause = f"WHERE organism = ${len(params) + 1} AND released_at IS NOT NULL"
        params.append(self.organism)
        
        if where_conditions:
            where_clause += f" AND ({' AND '.join(where_conditions)})"
        
        # Determine the insertion field path in processed_data
        if insertion_type == "nucleotide":
            insertion_path = "nucleotideInsertions"
        else:  # aminoAcid
            insertion_path = "aminoAcidInsertions"
        
        # Build query to extract insertions from processed_data JSONB
        query = f"""
        WITH insertion_data AS (
            SELECT 
                jsonb_array_elements(processed_data->'{insertion_path}') as insertion_obj
            FROM {self.base_table}
            {where_clause}
        ),
        parsed_insertions AS (
            SELECT 
                insertion_obj->>'insertion' as insertion,
                COALESCE((insertion_obj->>'count')::int, 0) as count,
                COALESCE(insertion_obj->>'insertedSymbols', '') as insertedSymbols,
                COALESCE((insertion_obj->>'position')::int, 0) as position,
                COALESCE(insertion_obj->>'sequenceName', '') as sequenceName
            FROM insertion_data
            WHERE insertion_obj IS NOT NULL
        ),
        aggregated_insertions AS (
            SELECT 
                insertion,
                SUM(count) as count,
                insertedSymbols,
                position,
                sequenceName
            FROM parsed_insertions
            WHERE insertion IS NOT NULL AND insertion != ''
            GROUP BY insertion, insertedSymbols, position, sequenceName
        )
        SELECT 
            insertion,
            count,
            insertedSymbols,
            position,
            sequenceName
        FROM aggregated_insertions
        ORDER BY count DESC, insertion
        """
        
        # Add ordering and limits
        if request.limit is not None:
            query += f" LIMIT ${len(params) + 1}"
            params.append(request.limit)
        if request.offset is not None:
            query += f" OFFSET ${len(params) + 1}"
            params.append(request.offset)
        
        return query.strip(), params
    
    def _build_where_conditions(self, request: LapisBaseRequest) -> Tuple[List[str], List[Any]]:
        """Build WHERE conditions from request parameters"""
        conditions = []
        params = []
        
        # Get all extra fields from the request (filters)
        request_dict = request.dict(exclude={'limit', 'offset', 'fields', 'orderBy', 'dataFormat'})
        
        for field, value in request_dict.items():
            if value is None:
                continue
                
            param_idx = len(params) + 1
            
            if field == 'accessionVersion':
                # Handle accessionVersion as a composite field
                if isinstance(value, list):
                    # For lists, we need to handle each accessionVersion separately
                    version_conditions = []
                    for av in value:
                        if '.' in str(av):
                            acc, ver = str(av).split('.', 1)
                            version_conditions.append(f"(accession = ${param_idx} AND version = ${param_idx + 1})")
                            params.extend([acc, ver])
                            param_idx += 2
                        else:
                            # If no dot, treat as accession only
                            version_conditions.append(f"accession = ${param_idx}")
                            params.append(str(av))
                            param_idx += 1
                    if version_conditions:
                        conditions.append(f"({' OR '.join(version_conditions)})")
                else:
                    # Single accessionVersion
                    if '.' in str(value):
                        acc, ver = str(value).split('.', 1)
                        conditions.append(f"(accession = ${param_idx} AND version = ${param_idx + 1})")
                        params.extend([acc, ver])
                    else:
                        # If no dot, treat as accession only
                        conditions.append(f"accession = ${param_idx}")
                        params.append(str(value))
            elif field == 'versionStatus':
                # Handle versionStatus special field
                if value == 'LATEST_VERSION':
                    # For latest version, we need a subquery to find the max version per accession
                    # This is complex, so for now we'll just filter released sequences
                    # In a full implementation, you'd add a proper subquery
                    pass  # Already filtering by released_at IS NOT NULL
                elif value == 'REVOKED':
                    conditions.append("is_revocation = true")
                elif value == 'REVISED':
                    # For revised, we need sequences that have newer versions
                    # This would require a complex subquery, skipping for now
                    pass
            elif field in ['accession', 'version', 'organism', 'submitter', 'group_id', 'status', 'released_at']:
                # Direct table fields
                if isinstance(value, list):
                    placeholders = ', '.join([f"${param_idx + i}" for i in range(len(value))])
                    conditions.append(f"{field} IN ({placeholders})")
                    params.extend(value)
                else:
                    conditions.append(f"{field} = ${param_idx}")
                    params.append(value)
            else:
                # Metadata fields in nested structure
                if isinstance(value, list):
                    placeholders = ', '.join([f"${param_idx + i}" for i in range(len(value))])
                    conditions.append(f"(joint_metadata->'metadata'->>{self._quote_literal(field)}) IN ({placeholders})")
                    params.extend(value)
                else:
                    conditions.append(f"(joint_metadata->'metadata'->>{self._quote_literal(field)}) = ${param_idx}")
                    params.append(str(value))
        
        return conditions, params
    
    def _build_order_clause(self, order_by: List[OrderBy]) -> str:
        """Build ORDER BY clause"""
        if not order_by:
            return ""
        
        order_items = []
        for order in order_by:
            direction = "ASC" if order.type == OrderType.ASCENDING else "DESC"
            
            if order.field in ['accession', 'version', 'organism', 'submitter', 'group_id', 'status']:
                order_items.append(f"{order.field} {direction}")
            elif order.field == 'accessionVersion':
                order_items.append(f"accession {direction}, version {direction}")
            else:
                # Metadata field
                order_items.append(f"(joint_metadata->>{self._quote_literal(order.field)}) {direction}")
        
        return f"ORDER BY {', '.join(order_items)}"
    
    def _quote_literal(self, value: str) -> str:
        """Quote a string literal for SQL"""
        return f"'{value.replace(chr(39), chr(39) + chr(39))}'"
    
    def _quote_identifier(self, identifier: str) -> str:
        """Quote an identifier for SQL"""
        return f'"{identifier}"'