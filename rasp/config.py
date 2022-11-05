import os
from dotenv import load_dotenv

load_dotenv()

config = {
    'render_url': os.environ['RENDER_URL']
}
