"""
Query Engine - Direct PostgreSQL replacement for LAPIS
"""

import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

try:
    from .database import get_database_pool, close_database_pool
    from .config import settings
    from .routers import sample
    from .compression_manager import initialize_compression_service, get_compression_service
except ImportError:
    from database import get_database_pool, close_database_pool
    from config import settings
    from routers import sample
    from compression_manager import initialize_compression_service, get_compression_service


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager"""
    # Startup
    await get_database_pool()
    
    # Initialize compression service if config file exists
    if os.path.exists(settings.config_file):
        try:
            initialize_compression_service(settings.config_file)
            print(f"Initialized compression service with config: {settings.config_file}")
            compression_service = get_compression_service()
            if compression_service:
                print(f"Available references: {compression_service.list_available_references()}")
        except Exception as e:
            print(f"Warning: Failed to initialize compression service: {e}")
    else:
        print(f"Warning: Config file not found at {settings.config_file}, compression disabled")
    
    yield
    
    # Shutdown
    await close_database_pool()


app = FastAPI(
    title="Loculus Query Engine",
    description="Direct PostgreSQL query engine replacing LAPIS",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers with organism parameter in path
app.include_router(sample.router, prefix="/{organism}/sample", tags=["sample"])

# Health check endpoint
@app.get("/actuator/health")
async def health_check():
    return {"status": "UP"}

@app.get("/{organism}/sample/info")
async def sample_info(organism: str):
    """Info endpoint for compatibility with LAPIS"""
    # For now, return static info regardless of organism
    # In a full implementation, this could return organism-specific information
    return {
        "dataVersion": "1.0.0",
        "info": {
            "apiVersion": "2.0.0",
            "title": f"Loculus Query Engine - {organism}"
        }
    }