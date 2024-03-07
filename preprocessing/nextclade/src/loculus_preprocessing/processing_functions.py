"""
Module to define pure functions for processing data
Each function takes input data and returns output data, warnings and errors
This makes it easy to test and reason about the code
"""

from datetime import datetime

from .datatypes import AnnotationSource, ProcessingAnnotation, ProcessingResult


class ProcessingFunctions:
    @staticmethod
    def check_date(date: str, input_field: str, output_field: str) -> ProcessingResult:
        """
        Check that date is complete YYYY-MM-DD
        If not according to format return error
        If in future, return warning
        """
        # Parse date
        warnings: list[ProcessingAnnotation] = []
        errors: list[ProcessingAnnotation] = []
        try:
            parsed_date = datetime.strptime(date, "%Y-%m-%d")
            if parsed_date > datetime.now():
                warnings.append(
                    ProcessingAnnotation(
                        source=AnnotationSource(field=output_field, type="metadata"),
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
                        source=AnnotationSource(field=output_field, type="metadata"),
                        message=error_message,
                    )
                ],
            )

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
                            source=AnnotationSource(field=output_field, type="metadata"),
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
                        source=AnnotationSource(field=output_field, type="metadata"),
                        message="Config error: No function matches the given string",
                    )
                ],
            )
