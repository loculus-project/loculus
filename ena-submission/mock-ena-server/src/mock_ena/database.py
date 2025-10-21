"""Database models and operations for mock ENA server."""

import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional


@dataclass
class Project:
    """Represents an ENA project submission."""
    id: Optional[int] = None
    alias: Optional[str] = None
    accession: Optional[str] = None
    submission_accession: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    taxon_id: Optional[str] = None
    created_at: Optional[str] = None


@dataclass
class Sample:
    """Represents an ENA sample submission."""
    id: Optional[int] = None
    alias: Optional[str] = None
    accession: Optional[str] = None
    biosample_accession: Optional[str] = None
    submission_accession: Optional[str] = None
    taxon_id: Optional[str] = None
    scientific_name: Optional[str] = None
    created_at: Optional[str] = None


@dataclass
class Assembly:
    """Represents an ENA assembly submission."""
    id: Optional[int] = None
    alias: Optional[str] = None
    accession: Optional[str] = None  # ERZ accession
    gca_accession: Optional[str] = None  # GCA accession (final)
    submission_accession: Optional[str] = None
    study_accession: Optional[str] = None
    sample_accession: Optional[str] = None
    status: str = "PENDING"  # PENDING, PROCESSING, COMPLETED, ERROR
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


@dataclass
class Submission:
    """Represents an ENA submission."""
    id: Optional[int] = None
    alias: Optional[str] = None
    accession: Optional[str] = None
    submission_type: Optional[str] = None  # PROJECT, SAMPLE, ASSEMBLY
    status: str = "SUCCESS"
    created_at: Optional[str] = None


class MockENADatabase:
    """SQLite database for mock ENA server."""

    def __init__(self, db_path: str = ":memory:"):
        """Initialize database connection.

        Args:
            db_path: Path to SQLite database file or ":memory:" for in-memory database
        """
        self.db_path = db_path
        self._persistent_conn = None

        if db_path != ":memory:":
            Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        else:
            # For in-memory databases, keep a persistent connection
            # Otherwise each connection creates a new empty database
            self._persistent_conn = sqlite3.connect(
                db_path,
                check_same_thread=False  # Allow use from multiple threads
            )
            self._persistent_conn.row_factory = sqlite3.Row

        self._init_database()

    @contextmanager
    def get_connection(self):
        """Get database connection context manager."""
        # Use persistent connection for in-memory databases
        if self._persistent_conn is not None:
            try:
                yield self._persistent_conn
                self._persistent_conn.commit()
            except Exception:
                self._persistent_conn.rollback()
                raise
        else:
            # For file-based databases, create a new connection each time
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            try:
                yield conn
                conn.commit()
            except Exception:
                conn.rollback()
                raise
            finally:
                conn.close()

    def _init_database(self):
        """Initialize database schema."""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            # Projects table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS projects (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    alias TEXT UNIQUE,
                    accession TEXT UNIQUE,
                    submission_accession TEXT,
                    title TEXT,
                    description TEXT,
                    taxon_id TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # Samples table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS samples (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    alias TEXT UNIQUE,
                    accession TEXT UNIQUE,
                    biosample_accession TEXT UNIQUE,
                    submission_accession TEXT,
                    taxon_id TEXT,
                    scientific_name TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # Assemblies table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS assemblies (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    alias TEXT UNIQUE,
                    accession TEXT UNIQUE,
                    gca_accession TEXT UNIQUE,
                    submission_accession TEXT,
                    study_accession TEXT,
                    sample_accession TEXT,
                    status TEXT DEFAULT 'PENDING',
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # Submissions table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS submissions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    alias TEXT,
                    accession TEXT UNIQUE,
                    submission_type TEXT,
                    status TEXT DEFAULT 'SUCCESS',
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)

    def create_project(self, project: Project) -> Project:
        """Create a new project."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO projects (alias, accession, submission_accession, title, description, taxon_id)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (project.alias, project.accession, project.submission_accession,
                  project.title, project.description, project.taxon_id))
            project.id = cursor.lastrowid

            # Get created_at timestamp
            cursor.execute("SELECT created_at FROM projects WHERE id = ?", (project.id,))
            project.created_at = cursor.fetchone()["created_at"]

        return project

    def create_sample(self, sample: Sample) -> Sample:
        """Create a new sample."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO samples (alias, accession, biosample_accession, submission_accession,
                                   taxon_id, scientific_name)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (sample.alias, sample.accession, sample.biosample_accession,
                  sample.submission_accession, sample.taxon_id, sample.scientific_name))
            sample.id = cursor.lastrowid

            cursor.execute("SELECT created_at FROM samples WHERE id = ?", (sample.id,))
            sample.created_at = cursor.fetchone()["created_at"]

        return sample

    def create_assembly(self, assembly: Assembly) -> Assembly:
        """Create a new assembly."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO assemblies (alias, accession, gca_accession, submission_accession,
                                      study_accession, sample_accession, status)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (assembly.alias, assembly.accession, assembly.gca_accession,
                  assembly.submission_accession, assembly.study_accession,
                  assembly.sample_accession, assembly.status))
            assembly.id = cursor.lastrowid

            cursor.execute("SELECT created_at, updated_at FROM assemblies WHERE id = ?",
                         (assembly.id,))
            row = cursor.fetchone()
            assembly.created_at = row["created_at"]
            assembly.updated_at = row["updated_at"]

        return assembly

    def create_submission(self, submission: Submission) -> Submission:
        """Create a new submission record."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO submissions (alias, accession, submission_type, status)
                VALUES (?, ?, ?, ?)
            """, (submission.alias, submission.accession, submission.submission_type,
                  submission.status))
            submission.id = cursor.lastrowid

            cursor.execute("SELECT created_at FROM submissions WHERE id = ?", (submission.id,))
            submission.created_at = cursor.fetchone()["created_at"]

        return submission

    def get_assembly_by_accession(self, accession: str) -> Optional[Assembly]:
        """Get assembly by ERZ accession."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM assemblies WHERE accession = ?", (accession,))
            row = cursor.fetchone()
            if row:
                return Assembly(**dict(row))
        return None

    def update_assembly_status(self, accession: str, status: str, gca_accession: Optional[str] = None):
        """Update assembly processing status."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            if gca_accession:
                cursor.execute("""
                    UPDATE assemblies
                    SET status = ?, gca_accession = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE accession = ?
                """, (status, gca_accession, accession))
            else:
                cursor.execute("""
                    UPDATE assemblies
                    SET status = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE accession = ?
                """, (status, accession))

    def get_project_by_alias(self, alias: str) -> Optional[Project]:
        """Get project by alias."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM projects WHERE alias = ?", (alias,))
            row = cursor.fetchone()
            if row:
                return Project(**dict(row))
        return None

    def get_sample_by_alias(self, alias: str) -> Optional[Sample]:
        """Get sample by alias."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM samples WHERE alias = ?", (alias,))
            row = cursor.fetchone()
            if row:
                return Sample(**dict(row))
        return None
