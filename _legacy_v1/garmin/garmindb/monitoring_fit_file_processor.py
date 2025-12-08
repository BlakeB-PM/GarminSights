"""Class that takes a parsed monitoring FIT file object and imports it into a database."""

__author__ = "Tom Goetz"
__copyright__ = "Copyright Tom Goetz"
__license__ = "GPL"

import logging
import sys
import traceback
import datetime

import fitfile
import idbutils

from .garmindb import File
from .garmindb import MonitoringDb, Monitoring, MonitoringInfo, MonitoringHeartRate, MonitoringIntensity, MonitoringClimb, MonitoringRespirationRate, MonitoringPulseOx
from .fit_file_processor import FitFileProcessor


logger = logging.getLogger(__file__)
logger.addHandler(logging.StreamHandler(stream=sys.stdout))
root_logger = logging.getLogger()


class MonitoringFitFileProcessor(FitFileProcessor):
    """Class that takes a parsed monitoring FIT file object and imports it into a database."""
    
    # Class-level counters for statistics
    _total_files_processed = 0
    _total_files_failed = 0
    _total_invalid_enum_values = 0
    _total_entries_processed = 0
    
    @classmethod
    def get_statistics(cls):
        """Get processing statistics."""
        return {
            'files_processed': cls._total_files_processed,
            'files_failed': cls._total_files_failed,
            'invalid_enum_values': cls._total_invalid_enum_values,
            'entries_processed': cls._total_entries_processed
        }
    
    @classmethod
    def reset_statistics(cls):
        """Reset statistics counters."""
        cls._total_files_processed = 0
        cls._total_files_failed = 0
        cls._total_invalid_enum_values = 0
        cls._total_entries_processed = 0

    def write_file(self, fit_file):
        """Given a Fit File object, write all of its messages to the DB."""
        self.current_file = fit_file.filename  # Store filename for better error messages
        logger.info("Processing monitoring file: %s", fit_file.filename)
        
        self.monitoring_fit_file_plugins = [plugin for plugin in self.plugin_manager.get_file_processors('MonitoringFit', fit_file).values()]
        if len(self.monitoring_fit_file_plugins):
            root_logger.info("Loaded %d monitoring plugins %r for file %s", len(self.monitoring_fit_file_plugins), self.monitoring_fit_file_plugins, fit_file)
        # Create the db after setting up the plugins so that plugin tables are handled properly
        self.garmin_mon_db = MonitoringDb(self.db_params, self.debug - 1)
        try:
            with self.garmin_db.managed_session() as self.garmin_db_session, self.garmin_mon_db.managed_session() as self.garmin_mon_db_session:
                self._write_message_types(fit_file, fit_file.message_types)
            logger.info("Successfully processed monitoring file: %s", fit_file.filename)
            self.__class__._total_files_processed += 1
        except Exception as e:
            self.__class__._total_files_failed += 1
            logger.error(
                "Error processing monitoring file '%s': %s. %s",
                fit_file.filename,
                str(e),
                traceback.format_exc()
            )
            raise

    def _plugin_dispatch(self, handler_name, *args, **kwargs):
        return super()._plugin_dispatch(self.monitoring_fit_file_plugins, handler_name, *args, **kwargs)

    @classmethod
    def __unpack_tuple(cls, entry, name, value, index):
        if type(value) is tuple:
            entry[name] = value[index]

    def _write_monitoring_info_entry(self, fit_file, message_fields):
        activity_types = message_fields.activity_type
        invalid_count = 0
        success_count = 0
        
        if isinstance(activity_types, list):
            for index, activity_type in enumerate(activity_types):
                # Skip invalid enum values (UnknownEnumValue) to prevent SQLAlchemy errors
                if activity_type is None:
                    continue
                # Check if it's an UnknownEnumValue by checking the string representation
                activity_type_str = str(activity_type)
                if 'UnknownEnumValue' in activity_type_str:
                    invalid_count += 1
                    self.__class__._total_invalid_enum_values += 1
                    logger.warning(
                        "⚠️  Invalid activity_type enum value detected in file '%s' at timestamp %s: %s. "
                        "Skipping this entry to prevent database errors.",
                        fit_file.filename,
                        message_fields.local_timestamp,
                        activity_type_str
                    )
                    continue
                
                entry = {
                    'file_id'                   : File.s_get_id(self.garmin_db_session, fit_file.filename),
                    'timestamp'                 : message_fields.local_timestamp,
                    'activity_type'             : activity_type,
                    'resting_metabolic_rate'    : message_fields.get('resting_metabolic_rate')
                }
                self.__unpack_tuple(entry, 'cycles_to_distance', message_fields.cycles_to_distance, index)
                self.__unpack_tuple(entry, 'cycles_to_calories', message_fields.cycles_to_calories, index)
                try:
                    MonitoringInfo.s_insert_or_update(self.garmin_mon_db_session, entry)
                    success_count += 1
                    self.__class__._total_entries_processed += 1
                except (ValueError, LookupError) as e:
                    # Catch enum validation errors and log them instead of failing
                    invalid_count += 1
                    self.__class__._total_invalid_enum_values += 1
                    logger.warning(
                        "⚠️  Database validation error for activity_type enum value in file '%s' at timestamp %s: %s. "
                        "Error: %s. Skipping this entry.",
                        fit_file.filename,
                        message_fields.local_timestamp,
                        activity_type_str,
                        str(e)
                    )
                    continue
        
        # Log summary if there were invalid values
        if invalid_count > 0:
            logger.info(
                "Processed monitoring_info entries from file '%s': %d successful, %d invalid (skipped)",
                fit_file.filename,
                success_count,
                invalid_count
            )

    def _write_monitoring_entry(self, fit_file, message_fields):
        # Only include not None values so that we match and update only if a table's columns if it has values.
        entry = idbutils.list_and_dict.dict_filter_none_values(message_fields)
        timestamp = fit_file.utc_datetime_to_local(message_fields.timestamp)
        # Hack: daily monitoring summaries appear at 00:00:00 localtime for the PREVIOUS day. Subtract a second so they appear in the previous day.
        if timestamp.time() == datetime.time.min:
            timestamp = timestamp - datetime.timedelta(seconds=1)
        entry['timestamp'] = timestamp
        logger.debug("monitoring entry: %r", entry)
        try:
            intersection = MonitoringHeartRate.intersection(entry)
            if len(intersection) > 1 and intersection['heart_rate'] > 0:
                MonitoringHeartRate.s_insert_or_update(self.garmin_mon_db_session, intersection)
            intersection = MonitoringIntensity.intersection(entry)
            if len(intersection) > 1:
                MonitoringIntensity.s_insert_or_update(self.garmin_mon_db_session, intersection)
            intersection = MonitoringClimb.intersection(entry)
            if len(intersection) > 1:
                MonitoringClimb.s_insert_or_update(self.garmin_mon_db_session, intersection)
            intersection = Monitoring.intersection(entry)
            if len(intersection) > 1:
                # Filter out invalid activity_type enum values before inserting
                if 'activity_type' in intersection:
                    activity_type = intersection['activity_type']
                    if activity_type is not None:
                        activity_type_str = str(activity_type)
                        if 'UnknownEnumValue' in activity_type_str:
                            self.__class__._total_invalid_enum_values += 1
                            logger.warning(
                                "⚠️  Invalid activity_type enum value in monitoring entry from file '%s' at timestamp %s: %s. "
                                "Skipping this entry.",
                                getattr(self, 'current_file', 'unknown'),
                                entry.get('timestamp'),
                                activity_type_str
                            )
                            return  # Skip this entry entirely
                Monitoring.s_insert_or_update(self.garmin_mon_db_session, intersection)
        except (ValueError, LookupError) as e:
            # Catch enum validation errors specifically
            if 'activity_type' in entry:
                self.__class__._total_invalid_enum_values += 1
                logger.warning(
                    "⚠️  Enum validation error in monitoring entry from file '%s' at timestamp %s: "
                    "activity_type=%r, error=%s. Skipping entry.",
                    getattr(self, 'current_file', 'unknown'),
                    entry.get('timestamp'),
                    entry.get('activity_type'),
                    str(e)
                )
            else:
                logger.error(
                    "ValueError in monitoring entry from file '%s' at timestamp %s: %s",
                    getattr(self, 'current_file', 'unknown'),
                    entry.get('timestamp'),
                    traceback.format_exc()
                )
        except Exception as e:
            logger.error(
                "Unexpected exception in monitoring entry from file '%s' at timestamp %s: %s. "
                "Entry data: %r",
                getattr(self, 'current_file', 'unknown'),
                entry.get('timestamp'),
                str(e),
                entry
            )

    def _write_respiration_entry(self, fit_file, message_fields):
        logger.debug("respiration message: %r", message_fields)
        rr = message_fields.get('respiration_rate')
        if rr > 0:
            respiration = {
                'timestamp' : fit_file.utc_datetime_to_local(message_fields.timestamp),
                'rr'        : rr,
            }
            if fit_file.type is fitfile.FileType.monitoring_b:
                MonitoringRespirationRate.s_insert_or_update(self.garmin_mon_db_session, respiration)
            else:
                raise ValueError(f'Unexpected file type {repr(fit_file.type)} for respiration message')

    def _write_pulse_ox_entry(self, fit_file, message_fields):
        logger.debug("pulse_ox message: %r", message_fields)
        if fit_file.type is fitfile.FileType.monitoring_b:
            pulse_ox = message_fields.get('pulse_ox')
            if pulse_ox is not None:
                pulse_ox_entry = {
                    'timestamp': fit_file.utc_datetime_to_local(message_fields.timestamp),
                    'pulse_ox': pulse_ox,
                }
                MonitoringPulseOx.s_insert_or_update(self.garmin_mon_db_session, pulse_ox_entry)
        else:
            raise ValueError(f'Unexpected file type {repr(fit_file.type)} for pulse ox')
