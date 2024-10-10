"""Module to define pure functions for processing data
Each function takes input data and returns output data, warnings and errors
This makes it easy to test and reason about the code
"""

import json
import logging
import re
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

options_cache = {}


def compute_options_cache(output_field: str, options_list: list[str]) -> dict[str, str]:
    """Create a dictionary mapping option to standardized option. Add dict to the options_cache."""
    options: dict[str, str] = {}
    for option in options_list:
        options[standardize_option(option)] = option
    options_cache[output_field] = options
    return options


def standardize_option(option):
    return " ".join(option.lower().split())


def invalid_value_annotation(input_datum, output_field, value_type) -> ProcessingAnnotation:
    return ProcessingAnnotation(
        source=[AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)],
        message=f"Invalid {value_type} value: {input_datum} for field {output_field}.",
    )


class ProcessingFunctions:
    @classmethod
    def call_function(
        cls,
        function_name: str,
        args: FunctionArgs,
        input_data: InputMetadata,
        output_field: str,
    ) -> ProcessingResult:
        if hasattr(cls, function_name):
            func = getattr(cls, function_name)
            try:
                result = func(input_data, output_field, args=args)
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
                            source=[
                                AnnotationSource(
                                    name=output_field, type=AnnotationSourceType.METADATA
                                )
                            ],
                            message=(
                                f"Internal Error: Function {function_name} did not return "
                                f"ProcessingResult with input {input_data} and args {args}, "
                                "please contact the administrator."
                            ),
                        )
                    ],
                )
            if isinstance(result, ProcessingResult):
                return result
            # Handle unexpected case where a called function does not return a ProcessingResult
            return ProcessingResult(
                datum=None,
                warnings=[],
                errors=[
                    ProcessingAnnotation(
                        source=[
                            AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                        ],
                        message="Function did not return ProcessingResult",
                    )
                ],
            )
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
    def check_date(
        input_data: InputMetadata,
        output_field: str,
        args: FunctionArgs = None,
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
                f"Parsing error: {e}"
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
    def parse_and_assert_past_date(
        input_data: InputMetadata,
        output_field,
        args: FunctionArgs = None,
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
                            source=[
                                AnnotationSource(
                                    name=output_field, type=AnnotationSourceType.METADATA
                                )
                            ],
                            message=f"Metadata field {output_field}:'{date_str}' - " + message,
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
                            message=f"Metadata field {output_field}:'{date_str}' is in the future.",
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
                            message=f"Metadata field {output_field}:'{date_str}' is after release date.",
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
                    message=f"Metadata field {output_field}: Date format is not recognized.",
                )
            ],
        )

    @staticmethod
    def parse_timestamp(
        input_data: InputMetadata,
        output_field: str,
        args: FunctionArgs = None,
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
                f"Timestamp is {timestamp} which is not in parseable YYYY-MM-DD. "
                f"Parsing error: {e}"
            )
            return ProcessingResult(
                datum=None,
                errors=[
                    ProcessingAnnotation(
                        source=[
                            AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                        ],
                        message=error_message,
                    )
                ],
                warnings=warnings,
            )

    @staticmethod
    def concatenate(
        input_data: InputMetadata, output_field: str, args: FunctionArgs = None
    ) -> ProcessingResult:
        """Concatenates input fields with accession_version using the "/" separator in the order
        specified by the order argument.
        """
        warnings: list[ProcessingAnnotation] = []
        errors: list[ProcessingAnnotation] = []

        number_fields = len(input_data.keys()) + 1

        accession_version = args["accession_version"]
        order = args["order"]
        type = args["type"]

        # Check accessionVersion only exists once in the list:
        if number_fields != len(order):
            logging.error(
                f"Concatenate: Expected {len(order)} fields, got {number_fields}. "
                f"This is probably a configuration error. (accession_version: {accession_version})"
            )
            errors.append(
                ProcessingAnnotation(
                    source=[
                        AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                    ],
                    message="Concatenation failed."
                    "This may be a configuration error, please contact the administrator.",
                )
            )
            return ProcessingResult(
                datum=None,
                warnings=warnings,
                errors=errors,
            )

        formatted_input_data = []
        try:
            for i in range(len(order)):
                if type[i] == "date":
                    processed = ProcessingFunctions.parse_and_assert_past_date(
                        {"date": input_data[order[i]]}, output_field
                    )
                    formatted_input_data.append("" if processed.datum is None else processed.datum)
                    errors += processed.errors
                    warnings += processed.warnings
                elif type[i] == "timestamp":
                    processed = ProcessingFunctions.parse_timestamp(
                        {"timestamp": input_data[order[i]]}, output_field
                    )
                    formatted_input_data.append("" if processed.datum is None else processed.datum)
                    errors += processed.errors
                    warnings += processed.warnings
                elif order[i] in input_data:
                    formatted_input_data.append(
                        "" if input_data[order[i]] is None else input_data[order[i]]
                    )
                else:
                    formatted_input_data.append(accession_version)
            logging.debug(f"formatted input data:{formatted_input_data}")

            result = "/".join(formatted_input_data)
            # To avoid downstream issues do not let the result start or end in a "/"
            # Also replace white space with '_'
            result = result.strip("/").replace(" ", "_")

            return ProcessingResult(datum=result, warnings=warnings, errors=errors)
        except ValueError as e:
            logging.error(f"Concatenate failed with {e} (accession_version: {accession_version})")
            errors.append(
                ProcessingAnnotation(
                    source=[
                        AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
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
        input_data: InputMetadata, output_field: str, args: FunctionArgs = None
    ) -> ProcessingResult:
        authors = input_data["authors"]

        if not authors:
            return ProcessingResult(
                datum=None,
                warnings=[],
                errors=[],
            )
        pattern = r'^([a-zA-Z\s\.\-]*,[a-zA-Z\s\.\-]*;)*'
        warnings: list[ProcessingAnnotation] = []
        errors: list[ProcessingAnnotation] = []
        if re.match(pattern, authors) is not None:
            return ProcessingResult(
                datum=authors,
                warnings=warnings,
                errors=errors,
            )

        error_message = (
            f"The authors list '{authors}' are not in a recognized format. Please ensure that "
            "authors are separated by semi-colons, and that each author’s last name and first "
            "name are separated by a comma. "
            "For example: 'lastname, firstname; lastname, firstname'."
        )
        return ProcessingResult(
            datum=None,
            errors=[
                ProcessingAnnotation(
                    source=[
                        AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                    ],
                    message=error_message,
                )
            ],
            warnings=warnings,
        )

    @staticmethod
    def identity(
        input_data: InputMetadata, output_field: str, args: FunctionArgs = None
    ) -> ProcessingResult:
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
                        errors.append(invalid_value_annotation(input_datum, output_field, "int"))
                case "float":
                    try:
                        output_datum = float(input_datum)
                    except ValueError:
                        output_datum = None
                        errors.append(invalid_value_annotation(input_datum, output_field, "float"))
                case "boolean":
                    if input_datum.lower() == "true":
                        output_datum = True
                    elif input_datum.lower() == "false":
                        output_datum = False
                    else:
                        output_datum = None
                        errors.append(
                            invalid_value_annotation(input_datum, output_field, "boolean")
                        )
                case _:
                    output_datum = input_datum
        else:
            output_datum = input_datum
        return ProcessingResult(datum=output_datum, warnings=[], errors=errors)

    @staticmethod
    def process_options(
        input_data: InputMetadata, output_field: str, args: FunctionArgs = None
    ) -> ProcessingResult:
        """Checks that option is in options"""
        if "options" not in args:
            return ProcessingResult(
                datum=None,
                warnings=[],
                errors=[
                    ProcessingAnnotation(
                        source=[
                            AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                        ],
                        message=(
                            "Website configuration error: no options specified for field "
                            f"{output_field}, please contact an administrator.",
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
                        source=[
                            AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
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
                        source=[
                            AnnotationSource(name=output_field, type=AnnotationSourceType.METADATA)
                        ],
                        message=error_msg,
                    )
                ],
            )
        return ProcessingResult(datum=output_datum, warnings=[], errors=[])


def format_frameshift(result):
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
    if result == "[]":
        return ""
    result = result.replace("'", '"')
    frame_shifts = json.loads(result)
    frame_shift_strings = []
    for frame_shift in frame_shifts:
        nuc_abs_list = [
            f"{nuc["begin"] + 1}-{nuc["end"]}"
            if (nuc["end"] + 1) > nuc["begin"]
            else f"{nuc["begin"] + 1}"
            for nuc in frame_shift["nucAbs"]
        ]
        codon = (
            f"{frame_shift["codon"]["begin"] + 1}-{frame_shift["codon"]["end"]}"
            if (frame_shift["codon"]["end"] + 1) > frame_shift["codon"]["begin"]
            else f"{frame_shift["codon"]["begin"] + 1}"
        )
        string_representation = (
            f"{frame_shift["cdsName"]}:" + codon + "(nt:" + ";".join(nuc_abs_list) + ")"
        )
        frame_shift_strings.append(string_representation)
    return ",".join(frame_shift_strings)


def format_stop_codon(result):
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
    if result == "[]":
        return ""
    result = result.replace("'", '"')
    stop_codons = json.loads(result)
    stop_codon_strings = []
    for stop_codon in stop_codons:
        stop_codon_string = f"{stop_codon["cdsName"]}:{stop_codon["codon"] + 1}"
        stop_codon_strings.append(stop_codon_string)
    return ",".join(stop_codon_strings)
