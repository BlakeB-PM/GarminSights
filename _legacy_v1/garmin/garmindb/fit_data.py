"""Class for importing monitoring FIT files into a database."""

__author__ = "Tom Goetz"
__copyright__ = "Copyright Tom Goetz"
__license__ = "GPL"


import sys
import logging
import traceback
from tqdm import tqdm

import fitfile
from idbutils import FileProcessor


logger = logging.getLogger(__file__)
logger.addHandler(logging.StreamHandler(stream=sys.stdout))
root_logger = logging.getLogger()


class FitData():
    """Class for importing FIT files into a database."""

    def __init__(self, input_dir, debug, latest=False, recursive=False, fit_types=None, measurement_system=fitfile.field_enums.DisplayMeasure.metric):
        """
        Return an instance of FitData.

        Parameters:
        input_dir (string): directory (full path) to check for monitoring data files
        debug (Boolean): enable debug logging
        latest (Boolean): check for latest files only
        fit_types (Fit.field_enums.FileType): check for this file type only
        measurement_system (enum): which measurement system to use when importing the files

        """
        logger.info("Processing %s FIT data from %s", fit_types, input_dir)
        self.measurement_system = measurement_system
        self.debug = debug
        self.fit_types = fit_types
        self.file_names = FileProcessor.dir_to_files(input_dir, fitfile.file.name_regex, latest, recursive)

    def file_count(self):
        """Return the number of files that will be processed."""
        return len(self.file_names)

    def process_files(self, fit_file_processor):
        """Import FIT files into the database."""
        total_files = len(self.file_names)
        successful_files = 0
        failed_files = 0
        skipped_files = 0
        
        logger.info("Starting to process %d FIT files", total_files)
        
        # Reset statistics if the processor supports it
        if hasattr(fit_file_processor, 'reset_statistics'):
            fit_file_processor.reset_statistics()
        
        for file_name in tqdm(self.file_names, unit='files'):
            try:
                fit_file = fitfile.file.File(file_name, self.measurement_system)
                if self.fit_types is None or fit_file.type in self.fit_types:
                    fit_file_processor.write_file(fit_file)
                    successful_files += 1
                    root_logger.debug("Wrote %s to the database", fit_file)
                else:
                    skipped_files += 1
                    root_logger.info("skipping non-matching %s", fit_file)
            except Exception as e:
                failed_files += 1
                logger.error("Failed to parse %s: %s", file_name, e)
                root_logger.error("Failed to parse %s: %s - %s", file_name, e, traceback.format_exc())
        
        # Log summary statistics
        logger.info(
            "Finished processing FIT files: %d total, %d successful, %d failed, %d skipped",
            total_files,
            successful_files,
            failed_files,
            skipped_files
        )
        
        # Log processor-specific statistics if available
        if hasattr(fit_file_processor, 'get_statistics'):
            stats = fit_file_processor.get_statistics()
            if stats.get('invalid_enum_values', 0) > 0:
                logger.info(
                    "Enum validation statistics: %d invalid enum values encountered and skipped during processing",
                    stats['invalid_enum_values']
                )
            if stats.get('entries_processed', 0) > 0:
                logger.info(
                    "Processing statistics: %d entries processed successfully",
                    stats['entries_processed']
                )
