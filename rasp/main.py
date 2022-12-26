#!/usr/bin/python3

import os
import logging
import pytz
from datetime import datetime, date
import time
import subprocess
import argparse
from time import sleep
from pijuice import PiJuice
from config import config
from contextlib import contextmanager
import requests
import shutil


BINARY_PATH = '/home/pi/eink-weather-display/rasp/usb-it8951/build/it8951'
# Millivoltages as positive integer. E.g. 2500 => -2500 mV = -2.5V
VCOM = 1150


def parse_args():
    p = argparse.ArgumentParser(description='eink-weather-display main.py')
    p.add_argument('--no-shutdown', action='store_true',
                   help='No shutdown after run')
    return p.parse_args()


DISPLAY_WIDTH = 1872
DISPLAY_HEIGHT = 1404
MIN_BATTERY_LEVEL = 10
WAKEUP_ON_CHARGE_BATTERY_LEVEL = 0


def main_wrapper():
    args = parse_args()

    # Note logging isn't sent to GCP before internet is available
    logging.info('Running main_wrapper')

    pj = get_pijuice()
    # Enable as early as possible in case an exception is raised during processing
    enable_wakeups(pj)

    with edp_display():
        shutdown_already_handled = False
        try:
            shutdown_already_handled = main(pj)
        except Exception as e:
            logging.error('Error during main:')
            logging.error(e)
            logging.info('Attempting to display error image...')
            display_render_image('images/error.png', fit=True)
            raise e
        finally:
            if shutdown_already_handled:
                logging.info('main_wrapper: shutdown already handled')
            elif is_pijuice_on_battery(pj):
                ssh_active = is_ssh_active()
                if ssh_active:
                    logging.info(
                        'Raspberry PI is on battery, but ssh session is active, keeping power on')
                elif args.no_shutdown:
                    logging.info(
                        'Raspberry PI is on battery, but --no-shutdown set, keeping power on')
                else:
                    logging.info(
                        'Raspberry PI is on battery, shutting down ...')
                    shutdown(pj)

            else:
                logging.info('Raspberry PI is on charging, keeping power on!')


def main(pj):
    wait_until_internet_connection()

    logging.info('Running main')
    run_cmd("git log --pretty=format:'%H %ad %s' -n 1")

    charge_level = pj.status.GetChargeLevel()
    logging.info('Charge level: {}'.format(charge_level))
    logging.debug('GetBatteryVoltage: {}'.format(
        pj.status.GetBatteryVoltage()))
    logging.debug('GetBatteryTemperature: {}'.format(
        pj.status.GetBatteryTemperature()))
    logging.debug('GetBatteryCurrent: {}'.format(
        pj.status.GetBatteryCurrent()))

    is_on_battery = is_pijuice_on_battery(pj)
    if is_on_battery:
        logging.info('Raspberry PI runs on battery power')
        if charge_level['data'] < MIN_BATTERY_LEVEL:
            logging.info(
                'Detected low battery! Displaying empty battery image...')
            display_render_image('images/battery-empty.png')

            logging.info('Disable RTC wakeup alarm')
            pj.rtcAlarm.SetWakeupEnabled(False)
            return
    else:
        logging.info('Raspberry PI is on cable-connected power')
        display_clear()

    res = fetch_image(is_on_battery, charge_level["data"])
    logging.info('Image request done')
    logging.info('Saving image to disk...')
    file_path = 'render_api_image.png'
    with open(file_path, 'wb') as f:
        res.raw.decode_content = True
        shutil.copyfileobj(res.raw, f)

    logging.info('Render image returned by the API...')
    display_render_image(file_path)

    if should_run_morning_tasks():
        git_pull()

    # Enable again just in case time syncronisation has unset the alarm
    enable_wakeups(pj)


def fetch_image(is_on_battery, battery_level, retries=2):
    for i in range(retries + 1):
        try:
            logging.info(
                'Getting image from API (attempt {})...'.format(i))
            paddings = {
                'top': 70,
                'right': 10,
                'bottom': 20,
                'left': 10,
            }
            res = requests.get(config['RENDER_URL'], stream=True, params={
                "batteryLevel": battery_level,
                "batteryCharging": 'false' if is_on_battery else 'true',
                "showBatteryPercentage": 'true',
                "lat": config['RENDER_LATITUDE'],
                "lon": config['RENDER_LONGITUDE'],
                "locationName": config['RENDER_LOCATION_NAME'],
                "timezone": config['RENDER_TIMEZONE'],
                "apiKey": config['RENDER_API_KEY'],
                # By default the image rendered is mirrored
                "flop": 'true',
                # These values are highly dependent on the physical installation of the screen
                "width": DISPLAY_WIDTH - paddings['right'] - paddings['left'],
                "height": DISPLAY_HEIGHT - paddings['top'] - paddings['bottom'],
                "paddingTop": paddings['top'],
                "paddingRight": paddings['right'],
                "paddingBottom": paddings['bottom'],
                "paddingLeft": paddings['left'],
            }, timeout=60)
            res.raise_for_status()
            return res
        except Exception as e:
            logging.warn('Attempt {} failed: {}'.format(i, e))
            logging.warn(e)
            continue

    raise Exception('Failed to request image API even after retries')


def should_run_morning_tasks():
    now = datetime.utcnow()
    # This should return True at least once in the morning
    return now.hour <= 5


def get_local_hour_as_utc(hour):
    local_tz = pytz.timezone('Europe/Helsinki')
    offset_secs = local_tz.utcoffset(datetime.now()).total_seconds()
    offset_hour = int(offset_secs / 60 / 60)
    utc_hour = hour - offset_hour
    if utc_hour < 0:
        return 24 - abs(utc_hour)
    return utc_hour % 24  # Wrap to max 23


def enable_wakeups(pj):
    # Wakeup at 6:00, 9, 12, 15, 18, and 21 at Europe/Helsinki time
    local_hours = [6, 9, 12, 15, 18, 21]
    utc_hours = [get_local_hour_as_utc(h) for h in local_hours]
    alarm_config = {
        'second': 0,
        'minute': 0,
        'hour': ';'.join(map(str, utc_hours)),
        'day': 'EVERY_DAY'
    }
    logging.debug('pj.rtcAlarm.SetAlarm() with params: {}'.format(alarm_config))
    pj.rtcAlarm.SetAlarm(alarm_config)
    logging.debug('pj.rtcAlarm.GetAlarm(): {}'.format(pj.rtcAlarm.GetAlarm()))
    # It looked like it's possible that time sync unsets the RTC alarm.
    # https://github.com/PiSupply/PiJuice/issues/362
    logging.debug('Enabling RTC wakeup alarm ...')
    pj.rtcAlarm.SetWakeupEnabled(True)
    logging.debug('Enabling wakeup on charge ({}) ...'.format(
        WAKEUP_ON_CHARGE_BATTERY_LEVEL))
    pj.power.SetWakeUpOnCharge(WAKEUP_ON_CHARGE_BATTERY_LEVEL)


def shutdown(pj):
    logging.info('Flushing logs ...')
    logging.shutdown()
    time.sleep(5)
    logging.info('Shutting down ...')
    # Make sure power to the Raspberry PI is stopped to not discharge the battery
    pj.power.SetSystemPowerSwitch(0)
    pj.power.SetPowerOff(15)  # Cut power after n seconds
    os.system("sudo shutdown -h now")


def git_pull():
    logging.info('Running git pull ...')
    run_cmd('cd /home/pi/eink-weather-display && git stash && git pull && git stash apply')


def is_ssh_active():
    result = run_cmd('ss -a | grep ssh | grep ESTAB')
    lines = result.stdout.decode('utf-8').strip().split()
    return len(lines) > 0


def is_pijuice_on_battery(pj):
    stat = pj.status.GetStatus()
    data = stat['data']
    return data['powerInput'] == "NOT_PRESENT" and data['powerInput5vIo'] == 'NOT_PRESENT'


def wait_until_internet_connection():
    logging.info('Waiting for internet connection ...')

    # Try to check for internet connection
    connection_found = loop_until_internet()

    if connection_found:
        return
    else:
        logging.info(
            'Internet connection not yet found, restarting networking...')
        # If not found, restart networking
        run_cmd('sudo ifconfig wlan0 down')
        time.sleep(5)
        run_cmd('sudo ifconfig wlan0 up')
        time.sleep(5)

    logging.info('Checking for internet again...')
    # Check for internet again
    if loop_until_internet():
        return

    raise Exception('Timeout waiting for internet connection')


def loop_until_internet(times=3):
    for i in range(times):
        try:
            res = requests.get(config['RENDER_URL'], params={
                'ping': 'true'}, timeout=8)
            if res.status_code == 200:
                logging.info('Internet connection found!')
                return True
        except:
            continue

    return False


def get_pijuice():
    # Since the start is very early in the boot sequence we wait for the i2c-1 device
    while not os.path.exists('/dev/i2c-1'):
        time.sleep(0.1)

    pj = PiJuice(1, 0x14)
    start = time.time()
    while True:
        if time.time() - start > 30:
            raise Exception('Timeout waiting for PIJuice to be ok')

        stat = pj.status.GetStatus()
        if stat['error'] == 'NO_ERROR':
            return pj
        else:
            sleep(0.1)


def run_cmd(cmd):
    logging.info('Running "{}"'.format(cmd))
    result = subprocess.run(cmd, shell=True, capture_output=True)
    logging.info('stdout:')
    logging.info(result.stdout)
    logging.info('stderr:')
    logging.info(result.stderr)
    logging.info('End of process output.')
    return result


def display_render_image(file_path, fit=False):
    display_clear()

    if fit:
        run_cmd('convert {} -thumbnail {}x{} -background white -gravity center -extent {}x{} fitted.png'.format(
            file_path, DISPLAY_WIDTH, DISPLAY_HEIGHT, DISPLAY_WIDTH, DISPLAY_HEIGHT))
        file_path = 'fitted.png'

    # Convert image to 8bit raw image
    run_cmd('stream -map r -storage-type char {} image.raw'.format(file_path))

    # Run process to update the image
    # The default mode is -m 2 (= Mode 2 GC16)
    # more here https://www.waveshare.com/wiki/10.3inch_e-Paper_HAT and https://www.waveshare.com/w/upload/c/c4/E-paper-mode-declaration.pdf
    run_cmd('sudo {} -v {} -d /dev/sda 0 0 {} {} < image.raw'.format(BINARY_PATH, VCOM,
                                                                     DISPLAY_WIDTH, DISPLAY_HEIGHT))


def display_clear():
    # Waveshare Wiki states:
    #  "INIT This mode is used for clearing the display. If you use A2 mode for
    #   updating, we recommend you use the INIT mode to clear display after
    #   updating several times."
    #
    # In the command, -m 0 refers to the INIT mode (Mode 0).
    run_cmd('sudo {} -v {} -d -c -m 0 /dev/sda 0 0 {} {} < image.raw'.format(BINARY_PATH, VCOM,
                                                                             DISPLAY_WIDTH, DISPLAY_HEIGHT))


@contextmanager
def edp_display():
    try:
        yield None
    finally:
        logging.debug('Calling after_display_usage')
        after_display_usage()


def after_display_usage():
    logging.info('TODO: Setting EPD back to sleep...')
    # TODO: How to set display into sleep?


if __name__ == '__main__':
    main_wrapper()
