"""Module to define pure functions for processing data
Each function takes input data and returns output data, warnings and errors
This makes it easy to test and reason about the code
"""

import logging
from datetime import datetime

import dateutil.parser as dateutil
import pytz

from .datatypes import (
    AnnotationSource,
    AnnotationSourceType,
    ProcessingAnnotation,
    ProcessingInput,
    ProcessingResult,
)

logger = logging.getLogger(__name__)


class ProcessingFunctions:
    @classmethod
    def call_function(
        cls, function_name, input_data: ProcessingInput, output_field: str
    ) -> ProcessingResult:
        if hasattr(cls, function_name):
            func = getattr(cls, function_name)
            try:
                result = func(input_data, output_field)
            except Exception as e:
                message = f"Error calling function {function_name} with arguments {input_data}: {e}"
                logger.exception(message)
            if isinstance(result, ProcessingResult):
                return result
            else:
                # Handle unexpected case where a called function does not return a ProcessingResult
                return ProcessingResult(
                    datum=None,
                    warnings=[],
                    errors=[
                        ProcessingAnnotation(
                            source=[
                                AnnotationSource(
                                    name=output_field, type=AnnotationSourceType.METADATA
                                )
                            ],
                            message="Function did not return ProcessingResult",
                        )
                    ],
                )
        else:
            # Handle the case where no function matches the given string
            return ProcessingResult(
                datum=None,
                warnings=[],
                errors=[
                    ProcessingAnnotation(
                        source=[
                            AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                        ],
                        message=f"Config error: No processing function matches: {function_name}",
                    )
                ],
            )

    @staticmethod
    def check_date(input_data: ProcessingInput, output_field: str) -> ProcessingResult:
        """Check that date is complete YYYY-MM-DD
        If not according to format return error
        If in future, return warning
        Expects input_data to be an ordered dictionary with a single key "date"
        """
        date = input_data["date"]

        if date is None:
            return ProcessingResult(
                datum=None,
                warnings=[],
                errors=[],
            )

        warnings: list[ProcessingAnnotation] = []
        errors: list[ProcessingAnnotation] = []
        try:
            parsed_date = datetime.strptime(date, "%Y-%m-%d")
            if parsed_date > datetime.now():
                warnings.append(
                    ProcessingAnnotation(
                        source=[
                            AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                        ],
                        message="Date is in the future.",
                    )
                )
            return ProcessingResult(datum=date, warnings=warnings, errors=errors)
        except ValueError as e:
            error_message = (
                f"Date is {date} which is not in the required format YYYY-MM-DD. "
                + f"Parsing error: {e}"
            )
            return ProcessingResult(
                datum=None,
                warnings=warnings,
                errors=[
                    ProcessingAnnotation(
                        source=[
                            AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                        ],
                        message=error_message,
                    )
                ],
            )

    @staticmethod
    def process_date(input_data: ProcessingInput, output_field) -> ProcessingResult:
        """Parse date string. If it's incomplete, add 01-01, if no year, return null and error"""
        logger.debug(f"input_data: {input_data}")
        date_str = input_data["date"] or ""
        release_date_str = input_data.get("release_date", "") or ""
        try:
            release_date = dateutil.parse(release_date_str)
        except Exception:
            release_date = None
        logger.debug(f"release_date: {release_date}")
        logger.debug(f"date_str: {date_str}")

        formats_to_messages = {
            "%Y-%m-%d": None,
            "%Y-%m": "Day is missing. Assuming the 1st.",
            "%Y": "Month and day are missing. Assuming January 1st.",
        }

        warnings = []
        errors = []

        if len(date_str) == 0:
            return ProcessingResult(
                datum=None,
                warnings=[],
                errors=[
                    ProcessingAnnotation(
                        source=[
                            AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                        ],
                        message="Collection date is required",
                    )
                ],
            )

        for format, message in formats_to_messages.items():
            try:
                parsed_date = datetime.strptime(date_str, format).replace(tzinfo=pytz.utc)
                match format:
                    case "%Y-%m-%d":
                        datum = parsed_date.strftime("%Y-%m-%d")
                    case "%Y-%m":
                        datum = f"{parsed_date.strftime('%Y-%m')}-01"
                    case "%Y":
                        datum = f"{parsed_date.strftime('%Y')}-01-01"

                logger.debug(f"parsed_date: {parsed_date}")

                if message:
                    warnings.append(
                        ProcessingAnnotation(
                            source=[
                                AnnotationSource(
                                    name=output_field, type=AnnotationSourceType.METADATA
                                )
                            ],
                            message=message,
                        )
                    )

                if parsed_date > datetime.now(tz=pytz.utc):
                    logger.debug(f"parsed_date: {parsed_date} > {datetime.now(tz=pytz.utc)}")
                    errors.append(
                        ProcessingAnnotation(
                            source=[
                                AnnotationSource(
                                    name=output_field, type=AnnotationSourceType.METADATA
                                )
                            ],
                            message="Collection date is in the future.",
                        )
                    )

                if release_date and parsed_date > release_date:
                    logger.debug(f"parsed_date: {parsed_date} > release_date: {release_date}")
                    errors.append(
                        ProcessingAnnotation(
                            source=[
                                AnnotationSource(
                                    name=output_field, type=AnnotationSourceType.METADATA
                                )
                            ],
                            message="Collection date is after release date.",
                        )
                    )

                return ProcessingResult(datum=datum, warnings=warnings, errors=errors)
            except ValueError:
                continue

        # If all parsing attempts fail, it's an unrecognized format
        return ProcessingResult(
            datum=None,
            warnings=[],
            errors=[
                ProcessingAnnotation(
                    source=[
                        AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                    ],
                    message="Date format is not recognized.",
                )
            ],
        )

    @staticmethod
    def parse_timestamp(input_data: ProcessingInput, output_field: str) -> ProcessingResult:
        """Parse a timestamp string, e.g. 2022-11-01T00:00:00Z and return a YYYY-MM-DD string"""
        timestamp = input_data["timestamp"]

        if timestamp is None:
            return ProcessingResult(
                datum=None,
                warnings=[],
                errors=[],
            )

        # Parse timestamp
        warnings: list[ProcessingAnnotation] = []
        errors: list[ProcessingAnnotation] = []
        try:
            parsed_timestamp = dateutil.parse(timestamp)
            return ProcessingResult(
                datum=parsed_timestamp.strftime("%Y-%m-%d"),
                warnings=warnings,
                errors=errors,
            )
        except ValueError as e:
            error_message = (
                f"Timestamp is {timestamp} which is not in parseable YYYY-MM-DD. "
                + f"Parsing error: {e}"
            )
            return ProcessingResult(
                datum=None,
                warnings=[
                    ProcessingAnnotation(
                        source=[
                            AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                        ],
                        message=error_message,
                    )
                ],
                errors=errors,
            )

    @staticmethod
    def identity(input_data: ProcessingInput, output_field: str) -> ProcessingResult:
        """Identity function, takes input_data["input"] and returns it as output"""
        if "input" not in input_data:
            return ProcessingResult(
                datum=None,
                warnings=[],
                errors=[
                    ProcessingAnnotation(
                        source=[
                            AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                        ],
                        message=f"No data found for output field: {output_field}",
                    )
                ],
            )
        return ProcessingResult(datum=input_data["input"], warnings=[], errors=[])
