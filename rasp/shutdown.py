#!/usr/bin/python3

import logging
from main import shutdown, get_pijuice, enable_wakeups

if __name__ == '__main__':
    logging.info('Running shutdown.py')
    pj = get_pijuice()
    enable_wakeups(pj)
    shutdown(pj)
