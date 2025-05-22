"""Database connection and utilities"""

import asyncpg
from typing import Optional, Dict, Any, List
import logging

try:
    from .config import settings
except ImportError:
    from config import settings

logger = logging.getLogger(__name__)

# Global connection pool
_pool: Optional[asyncpg.Pool] = None


async def get_database_pool() -> asyncpg.Pool:
    """Get or create the database connection pool"""
    global _pool
    if _pool is None:
        logger.info("Creating database connection pool")
        _pool = await asyncpg.create_pool(
            host=settings.database_host,
            port=settings.database_port,
            database=settings.database_name,
            user=settings.database_user,
            password=settings.database_password,
            min_size=settings.database_pool_min_size,
            max_size=settings.database_pool_max_size,
        )
    return _pool


async def close_database_pool():
    """Close the database connection pool"""
    global _pool
    if _pool:
        logger.info("Closing database connection pool")
        await _pool.close()
        _pool = None


async def execute_query(
    query: str, 
    params: Optional[tuple] = None
) -> List[Dict[str, Any]]:
    """Execute a query and return results as list of dictionaries"""
    pool = await get_database_pool()
    async with pool.acquire() as connection:
        rows = await connection.fetch(query, *(params or ()))
        return [dict(row) for row in rows]


async def execute_query_single(
    query: str, 
    params: Optional[tuple] = None
) -> Optional[Dict[str, Any]]:
    """Execute a query and return a single result"""
    results = await execute_query(query, params)
    return results[0] if results else None