#!/usr/bin/python3

import logging
import argparse
from main import edp_display, display_render_image


def parse_args():
    p = argparse.ArgumentParser(description='eink-weather-display image.py')
    p.add_argument('--image', required=True, action='store',
                   help='Display an image file')
    return p.parse_args()


def main():
    logging.info('Running image.py')
    args = parse_args()

    with edp_display():
        logging.info('Rendering {} ...'.format(args.image))
        display_render_image(args.image, fit=True)


if __name__ == '__main__':
    main()
