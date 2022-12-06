#!/usr/bin/python3

import logging
from main import shutdown, get_pijuice, is_pijuice_on_battery, enable_wakeups, is_ssh_active

MIN_UPTIME_SECONDS = 60 * 2
MAX_SSH_UPTIME_SECONDS = 60 * 60


def get_uptime():
    with open('/proc/uptime', 'r') as f:
        uptime_seconds = float(f.readline().split()[0])

    return uptime_seconds


if __name__ == '__main__':
    uptime_secs = get_uptime()
    logging.info(
        'Running shutdown_if_on_battery.py, uptime {}s'.format(uptime_secs))

    pj = get_pijuice()
    is_on_battery = is_pijuice_on_battery(pj)
    if uptime_secs < MIN_UPTIME_SECONDS:
        logging.info('Min uptime not exceeded yet ({}s), keeping power on'.format(
            MIN_UPTIME_SECONDS))
    if not is_on_battery:
        logging.info(
            'Raspberry PI connected to power cable, keeping power on!')
    elif is_ssh_active():
        logging.info('Raspberry PI running on battery, but ssh active')
        if uptime_secs > MAX_SSH_UPTIME_SECONDS:
            logging.info('Maximum ssh uptime exceeded, shutting down ...')
            enable_wakeups(pj)
            shutdown(pj)
        else:
            logging.info('Uptime {}s, so keeping power on'.format(uptime_secs))
    else:
        logging.info('Raspberry PI running on battery, shutting down ...')
        enable_wakeups(pj)
        shutdown(pj)
