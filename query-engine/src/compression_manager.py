"""
Global compression service manager to avoid circular imports
"""

from typing import Optional
from .compression import CompressionService

# Global compression service instance
_compression_service: Optional[CompressionService] = None


def initialize_compression_service(config_path: str) -> None:
    """Initialize the global compression service"""
    global _compression_service
    _compression_service = CompressionService(config_path)


def get_compression_service() -> Optional[CompressionService]:
    """Get the global compression service instance"""
    return _compression_service