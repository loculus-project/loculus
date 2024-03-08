"""
Module to define pure functions for processing data
Each function takes input data and returns output data, warnings and errors
This makes it easy to test and reason about the code
"""

from datetime import datetime

import dateutil.parser as dateutil

from .datatypes import AnnotationSource, ProcessingAnnotation, ProcessingResult


class ProcessingFunctions:
    @staticmethod
    def check_date(input_data: dict[str, str], output_field: str) -> ProcessingResult:
        """
        Check that date is complete YYYY-MM-DD
        If not according to format return error
        If in future, return warning
        Expects input_data to be an ordered dictionary with a single key "date"
        """
        date = input_data["date"]

        # Parse date
        warnings: list[ProcessingAnnotation] = []
        errors: list[ProcessingAnnotation] = []
        try:
            parsed_date = datetime.strptime(date, "%Y-%m-%d")
            if parsed_date > datetime.now():
                warnings.append(
                    ProcessingAnnotation(
                        source=[AnnotationSource(name=output_field, type="Metadata")],
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
                        source=[AnnotationSource(name=output_field, type="Metadata")],
                        message=error_message,
                    )
                ],
            )

    @staticmethod
    def process_date(input_data: dict[str, str], output_field) -> ProcessingResult:
        """Parse date string. If it's incomplete, add 01-01, if no year, return null and error"""
        date = input_data["date"]

        if date is None:
            date=""

        components = date.split("-")

        if len(components) == 0 or date == "":
            # No date provided
            return ProcessingResult(
                datum=None,
                warnings=[],
                errors=[
                    ProcessingAnnotation(
                        source=[AnnotationSource(name=output_field, type="Metadata")],
                        message=f"{output_field} is required. Must not be empty.",
                    )
                ],
            )
        elif len(components) == 1:
            # Only year is provided
            return ProcessingResult(
                datum=f"{date}-01-01",
                warnings=[
                    ProcessingAnnotation(
                        source=[AnnotationSource(name=output_field, type="Metadata")],
                        message="Month and day are missing. Assuming January 1st.",
                    )
                ],
                errors=[],
            )
        elif len(components) == 2:
            # Year and month are provided
            return ProcessingResult(
                datum=f"{date}-01",
                warnings=[
                    ProcessingAnnotation(
                        source=[AnnotationSource(name=output_field, type="Metadata")],
                        message="Day is missing. Assuming 1st.",
                    )
                ],
                errors=[],
            )
        elif len(components) == 3:
            # Full date is provided
            return ProcessingResult(datum=date, warnings=[], errors=[])
        else:
            # Invalid date format
            return ProcessingResult(
                datum=None,
                warnings=[],
                errors=[
                    ProcessingAnnotation(
                        source=[AnnotationSource(name=output_field, type="Metadata")],
                        message=f"{output_field} is not in the required format YYYY-MM-DD",
                    )
                ],
            )

    @staticmethod
    def parse_timestamp(
        input_data: dict[str, str], output_field: str
    ) -> ProcessingResult:
        """
        Parse a timestamp string, e.g. 2022-11-01T00:00:00Z and return a YYYY-MM-DD string
        """
        timestamp = input_data["timestamp"]

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
                        source=[AnnotationSource(name=output_field, type="Metadata")],
                        message=error_message,
                    )
                ],
                errors=errors,
            )

    @staticmethod
    def identity(input_data: dict[str, str], output_field: str) -> ProcessingResult:
        """
        Identity function, takes input_data["input"] and returns it as output
        """
        if "input" not in input_data:
            return ProcessingResult(
                datum=None,
                warnings=[],
                errors=[
                    ProcessingAnnotation(
                        source=[AnnotationSource(name=output_field, type="Metadata")],
                        message=f"No data found for output field: {output_field}",
                    )
                ],
            )
        return ProcessingResult(datum=input_data["input"], warnings=[], errors=[])

    @classmethod
    def call_function(
        cls, function_name, input_data: dict[str, str], output_field: str
    ) -> ProcessingResult:
        if hasattr(cls, function_name):
            func = getattr(cls, function_name)
            result = func(input_data, output_field)
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
                                AnnotationSource(name=output_field, type="Metadata")
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
                        source=[AnnotationSource(name=output_field, type="Metadata")],
                        message="Config error: No function matches the given string",
                    )
                ],
            )
