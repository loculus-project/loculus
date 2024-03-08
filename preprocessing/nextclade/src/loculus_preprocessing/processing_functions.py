"""
Module to define pure functions for processing data
Each function takes input data and returns output data, warnings and errors
This makes it easy to test and reason about the code
"""

from datetime import datetime

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
                            source=[AnnotationSource(name=output_field, type="Metadata")],
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
