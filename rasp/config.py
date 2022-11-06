import os
import logging
from dotenv import load_dotenv
import google.cloud.logging

load_dotenv()

config = {
    'RENDER_URL': os.environ['RENDER_URL'],
    'RENDER_API_KEY': os.environ['RENDER_API_KEY'],
    'RENDER_LATITUDE': os.environ['RENDER_LATITUDE'],
    'RENDER_LONGITUDE': os.environ['RENDER_LONGITUDE'],
    'RENDER_LOCATION_NAME': os.environ['RENDER_LOCATION_NAME'],
    'RENDER_TIMEZONE': os.environ['RENDER_TIMEZONE'],
}

logging.basicConfig(
    filename='/home/pi/status.log',
    level=logging.DEBUG,
    format='%(asctime)s %(levelname)s\t%(message)s',
    datefmt='%Y-%m-%dT%H:%M:%S')


# Instantiates a client
client = google.cloud.logging.Client()

# Retrieves a Cloud Logging handler based on the environment
# you're running in and integrates the handler with the
# Python logging module. By default this captures all logs
# at INFO level and higher
client.setup_logging(log_level=logging.DEBUG)
