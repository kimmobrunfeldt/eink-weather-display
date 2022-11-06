#!/usr/bin/python3

import logging
from main import shutdown, get_pijuice

if __name__ == '__main__':
    logging.info('Running shutdown.py')
    pj = get_pijuice()
    shutdown(pj)
