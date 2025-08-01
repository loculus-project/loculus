"""Module to define pure functions for processing data
Each function takes input data and returns output data, warnings and errors
This makes it easy to test and reason about the code
"""

import calendar
import json
import logging
import math
import re
from dataclasses import dataclass
from datetime import datetime

import dateutil.parser as dateutil
import pytz

from .datatypes import (
    AnnotationSource,
    AnnotationSourceType,
    FunctionArgs,
    InputMetadata,
    ProcessedMetadataValue,
    ProcessingAnnotation,
    ProcessingResult,
)

logger = logging.getLogger(__name__)

options_cache: dict[str, dict[str, str]] = {}


def compute_options_cache(output_field: str, options_list: list[str]) -> dict[str, str]:
    """Create a dictionary mapping option to standardized option. Add dict to the options_cache."""
    options: dict[str, str] = {}
    for option in options_list:
        options[standardize_option(option)] = option
    options_cache[output_field] = options
    return options


def standardize_option(option):
    return " ".join(option.lower().split())


def invalid_value_annotation(
    input_datum, output_field, input_fields, value_type
) -> ProcessingAnnotation:
    return ProcessingAnnotation(
        processedFields=[AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)],
        unprocessedFields=[
            AnnotationSource(name=field, type=AnnotationSourceType.METADATA)
            for field in input_fields
        ],
        message=f"Invalid {value_type} value: {input_datum} for field {output_field}.",
    )


def valid_authors(authors: str) -> bool:
    alpha = r"\s*[a-zA-Z]"
    name_chars = r"[a-zA-Z\s\.\-\']*"
    name = alpha + name_chars + "," + name_chars
    pattern = f"^{name}(;{name})*;?$"
    return re.match(pattern, authors) is not None


def warn_potentially_invalid_authors(authors: str) -> bool:
    authors_split = re.split(r"[,\s]+", authors)
    return bool(";" not in authors and len(authors_split) > 3)  # noqa: PLR2004


def format_authors(authors: str) -> str:
    authors_list = [author for author in authors.split(";") if author]
    loculus_authors = []
    for author in authors_list:
        author_single_white_space = re.sub(r"\s\s+", " ", author)
        last_name, first_name = (
            author_single_white_space.split(",")[0].strip(),
            author.split(",")[1].strip(),
        )
        suffix = ""
        match_suffix = re.search(r"[ .](II|III|IV|V|VI)$", first_name, re.IGNORECASE)
        if match_suffix:
            suffix = match_suffix.group(1).upper()
            first_name = re.sub(r"[ .](II|III|IV|V|VI)$", "", first_name, flags=re.IGNORECASE)
        first_names = []
        for name in first_name.split():
            if len(name) == 1:
                first_names.append(f"{name.upper()}.")
            elif len(name) == 2 and name[1] == ".":
                first_names.append(f"{name.upper()}")
            elif len(name) <= 4 and name.isupper() and "." not in name and not last_name.isupper():
                initials = " ".join(f"{char}." for char in name)
                first_names.append(initials)
            elif re.fullmatch(r"(?:[A-Za-z]\.)+[A-Za-z]+\.?", name):
                letters = [ch.upper() for ch in re.findall(r"[A-Za-z]", name)]
                initials = " ".join(f"{ch}." for ch in letters)
                first_names.append(initials)
            else:
                first_names.append(name)
        formated_first_name = " ".join(first_names)
        if suffix:
            formated_first_name = f"{formated_first_name} {suffix}"
        loculus_authors.append(f"{last_name}, {formated_first_name}")
    return "; ".join(loculus_authors).strip()


class ProcessingFunctions:
    @classmethod
    def call_function(
        cls,
        function_name: str,
        args: FunctionArgs,
        input_data: InputMetadata,
        output_field: str,
        input_fields: list[str],
    ) -> ProcessingResult:
        if not hasattr(cls, function_name):
            msg = (
                f"CRITICAL: No processing function matches: {function_name}."
                "This is a configuration error."
            )
            raise ValueError(msg)
        func = getattr(cls, function_name)
        try:
            result = func(input_data, output_field, input_fields=input_fields, args=args)
        except Exception as e:
            message = (
                f"Error calling function {function_name} for output field {output_field} "
                f"with input {input_data} and args {args}: {e}"
            )
            logger.exception(message)
            return ProcessingResult(
                datum=None,
                warnings=[],
                errors=[
                    ProcessingAnnotation(
                        processedFields=[
                            AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                        ],
                        unprocessedFields=[
                            AnnotationSource(name=field, type=AnnotationSourceType.METADATA)
                            for field in input_fields
                        ],
                        message=(
                            f"Internal Error: Function {function_name} did not return "
                            f"ProcessingResult with input {input_data} and args {args}, "
                            "please contact the administrator."
                        ),
                    )
                ],
            )
        if not isinstance(result, ProcessingResult):
            logger.error(
                f"ERROR: Function {function_name} did not return ProcessingResult "
                f"given input {input_data} and args {args}. "
                "This is likely a preprocessing bug."
            )
            return ProcessingResult(
                datum=None,
                warnings=[],
                errors=[
                    ProcessingAnnotation(
                        processedFields=[
                            AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                        ],
                        unprocessedFields=[
                            AnnotationSource(name=field, type=AnnotationSourceType.METADATA)
                            for field in input_fields
                        ],
                        message=(
                            f"Internal Error: Function {function_name} did not return "
                            f"ProcessingResult with input {input_data} and args {args}, "
                            "please contact the administrator."
                        ),
                    )
                ],
            )
        return result

    @staticmethod
    def check_date(
        input_data: InputMetadata,
        output_field: str,
        input_fields: list[str],
        args: FunctionArgs,  # args is essential - even if Pylance says it's not used
    ) -> ProcessingResult:
        """Check that date is complete YYYY-MM-DD
        If not according to format return error
        If in future, return warning
        Expects input_data to be an ordered dictionary with a single key "date"
        """
        date = input_data["date"]

        if not date:
            return ProcessingResult(
                datum=None,
                warnings=[],
                errors=[],
            )

        warnings: list[ProcessingAnnotation] = []
        errors: list[ProcessingAnnotation] = []
        try:
            parsed_date = datetime.strptime(date, "%Y-%m-%d").astimezone(pytz.utc)
            if parsed_date > datetime.now(tz=pytz.utc):
                warnings.append(
                    ProcessingAnnotation(
                        processedFields=[
                            AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                        ],
                        unprocessedFields=[
                            AnnotationSource(name=field, type=AnnotationSourceType.METADATA)
                            for field in input_fields
                        ],
                        message="Date is in the future.",
                    )
                )
            return ProcessingResult(datum=date, warnings=warnings, errors=errors)
        except ValueError as e:
            error_message = (
                f"Date is {date} which is not in the required format YYYY-MM-DD. Parsing error: {e}"
            )
            return ProcessingResult(
                datum=None,
                warnings=warnings,
                errors=[
                    ProcessingAnnotation(
                        processedFields=[
                            AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                        ],
                        unprocessedFields=[
                            AnnotationSource(name=field, type=AnnotationSourceType.METADATA)
                            for field in input_fields
                        ],
                        message=error_message,
                    )
                ],
            )

    @staticmethod
    def parse_date_into_range(
        input_data: InputMetadata,
        output_field: str,
        input_fields: list[str],
        args: FunctionArgs,  # args is essential - even if Pylance says it's not used
    ) -> ProcessingResult:
        """Parse date string (`input.date`) formatted as one of YYYY | YYYY-MM | YYYY-MM-DD into
        a range using upper bound (`input.releaseDate`)
        Return value determined FunctionArgs:
        fieldType: "dateRangeString" | "dateRangeLower" | "dateRangeUpper"
        Default fieldType is "dateRangeString"
        """
        if not args:
            args = {"fieldType": "dateRangeString"}

        logger.debug(f"input_data: {input_data}")

        input_date_str = input_data["date"]

        release_date_str = input_data.get("releaseDate", "") or ""
        try:
            release_date = dateutil.parse(release_date_str).replace(tzinfo=pytz.utc)
        except Exception:
            release_date = None

        try:
            submitted_at = datetime.fromtimestamp(float(str(args["submittedAt"])), tz=pytz.utc)
        except Exception:
            return ProcessingResult(
                datum=None,
                warnings=[],
                errors=[
                    ProcessingAnnotation(
                        processedFields=[
                            AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                        ],
                        unprocessedFields=[
                            AnnotationSource(name=field, type=AnnotationSourceType.METADATA)
                            for field in input_fields
                        ],
                        message=(
                            f"Internal Error: Function parse_into_ranges did not receive valid "
                            f"submittedAt date, with input {input_data} and args {args}, "
                            "please contact the administrator."
                        ),
                    )
                ],
            )

        max_upper_limit = min(submitted_at, release_date) if release_date else submitted_at

        if not input_date_str:
            return ProcessingResult(
                datum=max_upper_limit.strftime("%Y-%m-%d")
                if args["fieldType"] == "dateRangeUpper"
                else None,
                warnings=[],
                errors=[],
            )

        formats_to_messages = {
            "%Y-%m-%d": None,
            "%Y-%m": "Day is missing. Assuming date is some time in the month.",
            "%Y": "Month and day are missing. Assuming date is some time in the year.",
        }

        warnings = []
        errors = []

        @dataclass
        class DateRange:
            date_range_string: str | None
            date_range_lower: datetime | None
            date_range_upper: datetime

        for format, message in formats_to_messages.items():
            try:
                parsed_date = datetime.strptime(input_date_str, format).replace(tzinfo=pytz.utc)
            except ValueError:
                continue
            match format:
                case "%Y-%m-%d":
                    datum = DateRange(
                        date_range_string=parsed_date.strftime(format),
                        date_range_lower=parsed_date,
                        date_range_upper=parsed_date,
                    )
                case "%Y-%m":
                    datum = DateRange(
                        date_range_string=parsed_date.strftime(format),
                        date_range_lower=parsed_date.replace(day=1),
                        date_range_upper=(
                            parsed_date.replace(
                                day=calendar.monthrange(parsed_date.year, parsed_date.month)[1]
                            )
                        ),
                    )
                case "%Y":
                    datum = DateRange(
                        date_range_string=parsed_date.strftime(format),
                        date_range_lower=parsed_date.replace(month=1, day=1),
                        date_range_upper=parsed_date.replace(month=12, day=31),
                    )

            logger.debug(f"parsed_date: {datum}")

            if datum.date_range_upper > max_upper_limit:
                logger.debug(
                    "Tightening upper limit due to release date or current date. "
                    f"Original upper limit: {datum.date_range_upper},"
                    f"new upper limit: {max_upper_limit}"
                )
                datum.date_range_upper = max_upper_limit

            if message:
                warnings.append(
                    ProcessingAnnotation(
                        processedFields=[
                            AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                        ],
                        unprocessedFields=[
                            AnnotationSource(name=field, type=AnnotationSourceType.METADATA)
                            for field in input_fields
                        ],
                        message=f"Metadata field {output_field}:'{input_date_str}' - " + message,
                    )
                )

            if datum.date_range_lower and datum.date_range_lower > datetime.now(tz=pytz.utc):
                logger.debug(
                    f"Lower range of date: {datum.date_range_lower} > {datetime.now(tz=pytz.utc)}"
                )
                errors.append(
                    ProcessingAnnotation(
                        processedFields=[
                            AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                        ],
                        unprocessedFields=[
                            AnnotationSource(name=field, type=AnnotationSourceType.METADATA)
                            for field in input_fields
                        ],
                        message=f"Metadata field {output_field}:"
                        f"'{input_date_str}' is in the future.",
                    )
                )

            if release_date and datum.date_range_lower and (datum.date_range_lower > release_date):
                logger.debug(f"Lower range of date: {parsed_date} > release_date: {release_date}")
                errors.append(
                    ProcessingAnnotation(
                        processedFields=[
                            AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                        ],
                        unprocessedFields=[
                            AnnotationSource(name=field, type=AnnotationSourceType.METADATA)
                            for field in input_fields
                        ],
                        message=(
                            f"Metadata field {output_field}:'{input_date_str}'"
                            "is after release date."
                        ),
                    )
                )

            match args["fieldType"]:
                case "dateRangeString":
                    return_value = datum.date_range_string
                case "dateRangeLower":
                    if datum.date_range_lower is None:
                        return_value = None
                    else:
                        return_value = datum.date_range_lower.strftime("%Y-%m-%d")
                    warnings = errors = []
                case "dateRangeUpper":
                    return_value = datum.date_range_upper.strftime("%Y-%m-%d")
                    warnings = errors = []
                case _:
                    msg = f"Config error: Unknown fieldType: {args['fieldType']}"
                    raise ValueError(msg)

            return ProcessingResult(datum=return_value, warnings=warnings, errors=errors)

        # If all parsing attempts fail, it's an unrecognized format
        return ProcessingResult(
            datum=None,
            warnings=[],
            errors=[
                ProcessingAnnotation(
                    processedFields=[
                        AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                    ],
                    unprocessedFields=[
                        AnnotationSource(name=field, type=AnnotationSourceType.METADATA)
                        for field in input_fields
                    ],
                    message=f"Metadata field {output_field}: "
                    f"Date {input_date_str} could not be parsed.",
                )
            ],
        )

    @staticmethod
    def parse_and_assert_past_date(  # noqa: C901
        input_data: InputMetadata,
        output_field,
        input_fields: list[str],
        args: FunctionArgs,  # args is essential - even if Pylance says it's not used
    ) -> ProcessingResult:
        """Parse date string. If it's incomplete, add 01-01, if no year, return null and error
        input_data:
            date: str, date string to parse
            release_date: str, optional release date to compare against if None use today
        """
        logger.debug(f"input_data: {input_data}")
        date_str = input_data["date"]

        if not date_str:
            return ProcessingResult(
                datum=None,
                warnings=[],
                errors=[],
            )
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
                            processedFields=[
                                AnnotationSource(
                                    name=output_field, type=AnnotationSourceType.METADATA
                                )
                            ],
                            unprocessedFields=[
                                AnnotationSource(name=field, type=AnnotationSourceType.METADATA)
                                for field in input_fields
                            ],
                            message=f"Metadata field {output_field}:'{date_str}' - " + message,
                        )
                    )

                if parsed_date > datetime.now(tz=pytz.utc):
                    logger.debug(f"parsed_date: {parsed_date} > {datetime.now(tz=pytz.utc)}")
                    errors.append(
                        ProcessingAnnotation(
                            processedFields=[
                                AnnotationSource(
                                    name=output_field, type=AnnotationSourceType.METADATA
                                )
                            ],
                            unprocessedFields=[
                                AnnotationSource(name=field, type=AnnotationSourceType.METADATA)
                                for field in input_fields
                            ],
                            message=f"Metadata field {output_field}:'{date_str}' is in the future.",
                        )
                    )

                if release_date and parsed_date > release_date:
                    logger.debug(f"parsed_date: {parsed_date} > release_date: {release_date}")
                    errors.append(
                        ProcessingAnnotation(
                            processedFields=[
                                AnnotationSource(
                                    name=output_field, type=AnnotationSourceType.METADATA
                                )
                            ],
                            unprocessedFields=[
                                AnnotationSource(name=field, type=AnnotationSourceType.METADATA)
                                for field in input_fields
                            ],
                            message=(
                                f"Metadata field {output_field}:'{date_str}'is after release date."
                            ),
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
                    processedFields=[
                        AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                    ],
                    unprocessedFields=[
                        AnnotationSource(name=field, type=AnnotationSourceType.METADATA)
                        for field in input_fields
                    ],
                    message=f"Metadata field {output_field}: Date format is not recognized.",
                )
            ],
        )

    @staticmethod
    def parse_timestamp(
        input_data: InputMetadata,
        output_field: str,
        input_fields: list[str],
        args: FunctionArgs,  # args is essential - even if Pylance says it's not used
    ) -> ProcessingResult:
        """Parse a timestamp string, e.g. 2022-11-01T00:00:00Z and return a YYYY-MM-DD string"""
        timestamp = input_data["timestamp"]

        if not timestamp:
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
                f"Timestamp is {timestamp} which is not in parseable YYYY-MM-DD. Parsing error: {e}"
            )
            return ProcessingResult(
                datum=None,
                errors=[
                    ProcessingAnnotation(
                        processedFields=[
                            AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                        ],
                        unprocessedFields=[
                            AnnotationSource(name=field, type=AnnotationSourceType.METADATA)
                            for field in input_fields
                        ],
                        message=error_message,
                    )
                ],
                warnings=warnings,
            )

    @staticmethod
    def concatenate(
        input_data: InputMetadata,
        output_field: str,
        input_fields: list[str],
        args: FunctionArgs,
    ) -> ProcessingResult:
        """Concatenates input fields with accession_version using the "/" separator in the order
        specified by the order argument.
        """
        warnings: list[ProcessingAnnotation] = []
        errors: list[ProcessingAnnotation] = []

        number_fields = len(input_data.keys()) + 1

        if not isinstance(args["accession_version"], str):
            return ProcessingResult(
                datum=None,
                warnings=[],
                errors=[
                    ProcessingAnnotation(
                        processedFields=[
                            AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                        ],
                        unprocessedFields=[
                            AnnotationSource(name=field, type=AnnotationSourceType.METADATA)
                            for field in input_fields
                        ],
                        message=(
                            f"Internal Error: Function concatenate did not receive accession_version "
                            f"ProcessingResult with input {input_data} and args {args}, "
                            "please contact the administrator."
                        ),
                    )
                ],
            )

        accession_version: str = args["accession_version"]
        order = args["order"]
        type = args["type"]

        def add_errors():
            errors.append(
                ProcessingAnnotation(
                    processedFields=[
                        AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                    ],
                    unprocessedFields=[
                        AnnotationSource(name=field, type=AnnotationSourceType.METADATA)
                        for field in input_fields
                    ],
                    message="Concatenation failed."
                    "This may be a configuration error, please contact the administrator.",
                )
            )

        if not isinstance(order, list):
            logger.error(
                f"Concatenate: Expected order field to be a list. "
                f"This is probably a configuration error. (accession_version: {accession_version})"
            )
            add_errors()
            return ProcessingResult(
                datum=None,
                warnings=warnings,
                errors=errors,
            )
        if number_fields != len(order):
            logger.error(
                f"Concatenate: Expected {len(order)} fields, got {number_fields}. "
                f"This is probably a configuration error. (accession_version: {accession_version})"
            )
            add_errors()
            return ProcessingResult(
                datum=None,
                warnings=warnings,
                errors=errors,
            )
        if not isinstance(type, list):
            logger.error(
                f"Concatenate: Expected type field to be a list. "
                f"This is probably a configuration error. (accession_version: {accession_version})"
            )
            add_errors()
            return ProcessingResult(
                datum=None,
                warnings=warnings,
                errors=errors,
            )

        formatted_input_data: list[str] = []
        try:
            for i in range(len(order)):
                if type[i] == "date":
                    processed = ProcessingFunctions.parse_and_assert_past_date(
                        {"date": input_data[order[i]]}, output_field, input_fields, args
                    )
                    formatted_input_data.append(
                        "" if processed.datum is None else str(processed.datum)
                    )
                elif type[i] == "timestamp":
                    processed = ProcessingFunctions.parse_timestamp(
                        {"timestamp": input_data[order[i]]}, output_field, input_fields, args
                    )
                    formatted_input_data.append(
                        "" if processed.datum is None else str(processed.datum)
                    )
                elif order[i] in input_data:
                    formatted_input_data.append(
                        "" if input_data[order[i]] is None else str(input_data[order[i]])
                    )
                else:
                    formatted_input_data.append(accession_version)
            logger.debug(f"formatted input data:{formatted_input_data}")

            result = "/".join(formatted_input_data)
            # To avoid downstream issues do not let the result start or end in a "/"
            # Also replace white space with '_'
            result = result.strip("/").replace(" ", "_")

            return ProcessingResult(datum=result, warnings=warnings, errors=errors)
        except ValueError as e:
            logger.error(f"Concatenate failed with {e} (accession_version: {accession_version})")
            errors.append(
                ProcessingAnnotation(
                    processedFields=[
                        AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                    ],
                    unprocessedFields=[
                        AnnotationSource(name=field, type=AnnotationSourceType.METADATA)
                        for field in input_fields
                    ],
                    message=(
                        f"Concatenation failed for {output_field}. This is a technical error, "
                        "please contact the administrator."
                    ),
                )
            )
            return ProcessingResult(
                datum=None,
                errors=errors,
                warnings=warnings,
            )

    @staticmethod
    def check_authors(
        input_data: InputMetadata,
        output_field: str,
        input_fields: list[str],
        args: FunctionArgs,
    ) -> ProcessingResult:
        authors = input_data["authors"]

        author_format_description = (
            "Please ensure that "
            "authors are separated by semi-colons. Each author's name should be in the format "
            "'last name, first name;'. Last name(s) is mandatory, a comma is mandatory to "
            "separate first names/initials from last name. Only ASCII alphabetical characters A-Z "
            "are allowed. For example: 'Smith, Anna; Perez, Tom J.; Xu, X.L.;' "
            "or 'Xu,;' if the first name is unknown."
        )
        warnings: list[ProcessingAnnotation] = []
        errors: list[ProcessingAnnotation] = []

        if not authors:
            return ProcessingResult(
                datum=None,
                warnings=warnings,
                errors=errors,
            )
        try:
            authors.encode("ascii")
        except UnicodeEncodeError:
            error_message = (
                f"The authors list '{authors}' contains non-ASCII characters. "
                + author_format_description
            )
            return ProcessingResult(
                datum=None,
                errors=[
                    ProcessingAnnotation(
                        processedFields=[
                            AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                        ],
                        unprocessedFields=[
                            AnnotationSource(name=field, type=AnnotationSourceType.METADATA)
                            for field in input_fields
                        ],
                        message=error_message,
                    )
                ],
                warnings=warnings,
            )
        if valid_authors(authors):
            formatted_authors = format_authors(authors)
            if warn_potentially_invalid_authors(authors):
                warning_message = (
                    f"The authors list '{authors}' might not be using the Loculus format. "
                    + author_format_description
                )
                warnings.append(
                    ProcessingAnnotation(
                        processedFields=[
                            AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                        ],
                        unprocessedFields=[
                            AnnotationSource(name=field, type=AnnotationSourceType.METADATA)
                            for field in input_fields
                        ],
                        message=warning_message,
                    )
                )
            if " and " in authors:
                warning_message = (
                    f"Authors list '{authors}' contains 'and'. This may indicate a misformatted "
                    "authors list. Authors should always be separated by semi-colons only e.g. "
                    "`Smith, Anna; Perez, Tom J.; Xu, X.L.`."
                )
                warnings.append(
                    ProcessingAnnotation(
                        processedFields=[
                            AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                        ],
                        unprocessedFields=[
                            AnnotationSource(name=field, type=AnnotationSourceType.METADATA)
                            for field in input_fields
                        ],
                        message=warning_message,
                    )
                )
            return ProcessingResult(
                datum=formatted_authors,
                warnings=warnings,
                errors=errors,
            )
        error_message = (
            f"The authors list '{authors}' is not in a recognized format. "
            + author_format_description
        )
        return ProcessingResult(
            datum=None,
            errors=[
                ProcessingAnnotation(
                    processedFields=[
                        AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                    ],
                    unprocessedFields=[
                        AnnotationSource(name=field, type=AnnotationSourceType.METADATA)
                        for field in input_fields
                    ],
                    message=error_message,
                )
            ],
            warnings=warnings,
        )

    @staticmethod
    def check_regex(
        input_data: InputMetadata,
        output_field: str,
        input_fields: list[str],
        args: FunctionArgs,
    ) -> ProcessingResult:
        """
        Validates that the field regex_field matches the regex expression.
        If not return error
        """
        regex_field = input_data["regex_field"]

        warnings: list[ProcessingAnnotation] = []
        errors: list[ProcessingAnnotation] = []

        pattern = args["pattern"]

        if not regex_field:
            return ProcessingResult(datum=None, warnings=warnings, errors=errors)
        if not isinstance(pattern, str):
            errors.append(
                ProcessingAnnotation(
                    processedFields=[
                        AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                    ],
                    unprocessedFields=[
                        AnnotationSource(name=field, type=AnnotationSourceType.METADATA)
                        for field in input_fields
                    ],
                    message=(
                        f"Internal Error: Function check_regex did not receive valid "
                        f"regex pattern, with input {input_data} and args {args}, "
                        "please contact the administrator."
                    ),
                )
            )
            return ProcessingResult(datum=None, warnings=warnings, errors=errors)

        if re.match(pattern, regex_field):
            return ProcessingResult(datum=regex_field, warnings=warnings, errors=errors)
        errors.append(
            ProcessingAnnotation(
                processedFields=[
                    AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                ],
                unprocessedFields=[
                    AnnotationSource(name=field, type=AnnotationSourceType.METADATA)
                    for field in input_fields
                ],
                message=f"The value '{regex_field}' does not match the expected regex pattern: '{pattern}'.",
            )
        )
        return ProcessingResult(datum=None, warnings=warnings, errors=errors)

    @staticmethod
    def identity(  # noqa: C901, PLR0912
        input_data: InputMetadata, output_field: str, input_fields: list[str], args: FunctionArgs
    ) -> ProcessingResult:
        """Identity function, takes input_data["input"] and returns it as output"""
        if "input" not in input_data:
            return ProcessingResult(
                datum=None,
                warnings=[],
                errors=[
                    ProcessingAnnotation(
                        processedFields=[
                            AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                        ],
                        unprocessedFields=[
                            AnnotationSource(name=field, type=AnnotationSourceType.METADATA)
                            for field in input_fields
                        ],
                        message=f"No data found for output field: {output_field}",
                    )
                ],
            )
        input_datum = input_data["input"]
        if not input_datum:
            return ProcessingResult(datum=None, warnings=[], errors=[])

        errors: list[ProcessingAnnotation] = []
        output_datum: ProcessedMetadataValue
        if args and "type" in args:
            match args["type"]:
                case "int":
                    try:
                        output_datum = int(input_datum)
                    except ValueError:
                        output_datum = None
                        errors.append(
                            invalid_value_annotation(input_datum, output_field, input_fields, "int")
                        )
                case "float":
                    try:
                        output_datum = float(input_datum)
                        if math.isnan(output_datum):
                            output_datum = None
                        elif math.isinf(output_datum):
                            raise ValueError
                    except ValueError:
                        output_datum = None
                        errors.append(
                            invalid_value_annotation(
                                input_datum, output_field, input_fields, "float"
                            )
                        )
                case "boolean":
                    if input_datum.lower() == "true":
                        output_datum = True
                    elif input_datum.lower() == "false":
                        output_datum = False
                    else:
                        output_datum = None
                        errors.append(
                            invalid_value_annotation(
                                input_datum, output_field, input_fields, "boolean"
                            )
                        )
                case _:
                    output_datum = input_datum
        else:
            output_datum = input_datum
        return ProcessingResult(datum=output_datum, warnings=[], errors=errors)

    @staticmethod
    def process_options(
        input_data: InputMetadata, output_field: str, input_fields: list[str], args: FunctionArgs
    ) -> ProcessingResult:
        """Checks that option is in options"""
        if "options" not in args or not isinstance(args["options"], list):
            return ProcessingResult(
                datum=None,
                warnings=[],
                errors=[
                    ProcessingAnnotation(
                        processedFields=[
                            AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                        ],
                        unprocessedFields=[
                            AnnotationSource(name=field, type=AnnotationSourceType.METADATA)
                            for field in input_fields
                        ],
                        message=(
                            "Website configuration error: no options list specified for field "
                            f"{output_field}, please contact an administrator."
                        ),
                    )
                ],
            )
        input_datum = input_data["input"]
        if not input_datum:
            return ProcessingResult(datum=None, warnings=[], errors=[])

        output_datum: ProcessedMetadataValue
        standardized_input_datum = standardize_option(input_datum)
        if output_field in options_cache:
            options = options_cache[output_field]
        else:
            options = compute_options_cache(output_field, args["options"])
        error_msg = (
            f"Metadata field {output_field}:'{input_datum}' - not in list of accepted options."
        )
        if standardized_input_datum in options:
            output_datum = options[standardized_input_datum]
        # Allow ingested data to include fields not in options
        elif args["submitter"] == "insdc_ingest_user":
            return ProcessingResult(
                datum=input_datum,
                warnings=[
                    ProcessingAnnotation(
                        processedFields=[
                            AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                        ],
                        unprocessedFields=[
                            AnnotationSource(name=field, type=AnnotationSourceType.METADATA)
                            for field in input_fields
                        ],
                        message=error_msg,
                    )
                ],
                errors=[],
            )
        else:
            return ProcessingResult(
                datum=None,
                warnings=[],
                errors=[
                    ProcessingAnnotation(
                        processedFields=[
                            AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                        ],
                        unprocessedFields=[
                            AnnotationSource(name=field, type=AnnotationSourceType.METADATA)
                            for field in input_fields
                        ],
                        message=error_msg,
                    )
                ],
            )
        return ProcessingResult(datum=output_datum, warnings=[], errors=[])


def format_frameshift(input: str | None) -> str | None:
    """
    In nextclade frameshifts have the json format:
    [{
          "cdsName": "GPC",
          "nucRel": {
            "begin": 5,
            "end": 20
          },
          "nucAbs": [
            {
              "begin": 97,
              "end": 112
            }
          ],
          "codon": {
            "begin": 2,
            "end": 7
          },
          "gapsLeading": {
            "begin": 1,
            "end": 2
          },
          "gapsTrailing": {
            "begin": 7,
            "end": 8
          }
        },...
    ]

    This function:
    * converts this json object to a comma separated list of frameshift elements:
    cdsName:codon.begin-codon.end(nucAbs.begin-nucAbs.end;...)
    * Additionally, if there is only one element in this range only output the first element
    e.g. cdsName:codon.begin(nucAbs.begin)
    * Converts frameshift positions from index-0 to index-1 (this aligns with other metrics)
    * Makes the range [] have an inclusive start and inclusive end
    (the default in nextclade is exclusive end)
    """
    if input is None:
        return None
    if input == "[]":
        return ""

    def range_string(_start: str | int, _end: str | int) -> str:
        """Converts 0-indexed exclusive range to 1-indexed inclusive range string"""
        start = int(_start) + 1
        end = int(_end)
        if end > start:
            return f"{start}-{end}"
        return str(start)

    frame_shifts = json.loads(
        input.replace("'", '"')
    )  # Required for json.loads to recognize input as json string and convert to dict
    frame_shift_strings = []
    for frame_shift in frame_shifts:
        nuc_range_list = [range_string(nuc["begin"], nuc["end"]) for nuc in frame_shift["nucAbs"]]
        codon_range = range_string(frame_shift["codon"]["begin"], frame_shift["codon"]["end"])
        frame_shift_strings.append(
            frame_shift["cdsName"] + f":{codon_range}(nt:" + ";".join(nuc_range_list) + ")"
        )
    return ",".join(frame_shift_strings)


def format_stop_codon(result: str | None) -> str | None:
    """
    In nextclade stop codons have the json format:
    [   {
            cdsName: String,
            codon: usize,
        },...
    ]

    This function:
    * converts this to a comma-separated list of strings: cdsName:codon
    * Converts stop codon positions from index-0 to index-1 (this aligns with other metrics)
    """
    if result is None:
        return None
    if result == "[]":
        return ""
    result = result.replace("'", '"')
    stop_codons = json.loads(result)
    stop_codon_strings = []
    for stop_codon in stop_codons:
        stop_codon_string = f"{stop_codon['cdsName']}:{stop_codon['codon'] + 1}"
        stop_codon_strings.append(stop_codon_string)
    return ",".join(stop_codon_strings)


def trim_ns(sequence: str) -> str:
    """
    Trims 'N' and 'n' characters from the start and end of a nucleotide sequence.

    Args:
        sequence (str): The nucleotide sequence to process.

    Returns:
        str: The trimmed sequence.
    """
    return sequence.strip("Nn")
