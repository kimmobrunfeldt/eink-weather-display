#!/usr/bin/python3

import logging
from main import shutdown, get_pijuice, is_pijuice_on_battery, enable_wakeups

MIN_UPTIME_SECONDS = 60 * 15


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
        logging.info('Min uptime not exceeded yet ({}s)'.format(
            MIN_UPTIME_SECONDS))
    elif is_on_battery:
        logging.info('Raspberry PI running on battery, shutting down ...')
        enable_wakeups(pj)
        shutdown(pj)
    else:
        logging.info(
            'Raspberry PI connected to power cable, nothing to do!')
