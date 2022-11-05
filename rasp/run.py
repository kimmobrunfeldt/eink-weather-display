#!/usr/bin/python3

import os
import logging
from time import sleep
from pijuice import PiJuice
from config import config
import requests
import shutil

logging.basicConfig(
    filename='/home/pi/status.log',
    level=logging.DEBUG,
    format='%(asctime)s %(message)s',
    datefmt='%d/%m/%Y %H:%M:%S')


def main():
    pj = PiJuice(1, 0x14)
    wait_until_pijuice_ok(pj)

    data = stat['data']
    if data['powerInput'] != "NOT_PRESENT" or data['powerInput5vIo'] != 'NOT_PRESENT':
        logging.info(
            'Raspberry PI runs on connected power. Will not schedule shutdown!')
        return

    logging.info('Raspberry PI runs on battery power. Updateing...')

    download_image('image.png')
    # TODO: Update screen

    sleep(180)

    # Make sure wakeup_enabled and wakeup_on_charge have the correct values
    pj.rtcAlarm.SetWakeupEnabled(True)
    pj.power.SetWakeUpOnCharge(0)

    # Make sure power to the Raspberry PI is stopped to not discharge the battery
    pj.power.SetSystemPowerSwitch(0)
    pj.power.SetPowerOff(30)

    os.system("sudo shutdown -h now")


def wait_until_pijuice_ok(pj):
    pjOK = False
    while not pjOK:
        stat = pj.status.GetStatus()
        if stat['error'] == 'NO_ERROR':
            pjOK = True
        else:
            sleep(0.1)


def download_image(file_path):
    req = requests.get(config['render_url'], stream=True)
    if req.status_code == 200:
        with open(file_path, 'wb') as f:
            req.raw.decode_content = True
            shutil.copyfileobj(req.raw, f)


if __name__ == '__main__':
    main()
