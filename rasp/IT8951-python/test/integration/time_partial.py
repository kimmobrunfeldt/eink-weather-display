
from PIL import ImageDraw, ImageFont
import cProfile
import pstats
import io
from itertools import cycle
from timeit import default_timer

from IT8951 import constants
from IT8951.display import AutoEPDDisplay

def place_text(img, text, x, y):
    '''
    Place some text on the image
    '''
    fontsize = 20

    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype("/usr/share/fonts/truetype/freefont/FreeMono.ttf", fontsize)

    draw.text((x, y), text, font=font)

class Profiler:
    def __init__(self):
        self.pr = cProfile.Profile()

    def profile_func(self, f, *args, **kwargs):
        self.pr.enable()
        f(*args, **kwargs)
        self.pr.disable()

    def print_results(self, sortby='cumulative'):
        s = io.StringIO()
        ps = pstats.Stats(self.pr, stream=s).sort_stats(sortby)
        ps.print_stats()
        print(s.getvalue())

def main():
    print('Initializing...')
    display = AutoEPDDisplay(vcom=-2.06)

    display.clear()

    # so that we're not timing the previous operations
    display.epd.wait_display_ready()

    print('Doing partial update...')

    char_height = 20
    char_width = 12

    rows = display.height // char_height
    cols = display.width // char_width

    p = Profiler()

    text = 'partialupdate'
    start = default_timer()
    for n,c in enumerate(cycle(text)):
        row = n // cols
        col = n % cols
        place_text(display.frame_buf, c, x=col*char_width, y=row*char_height)
        p.profile_func(
            display.draw_partial,
            constants.DisplayModes.DU   # should see what best mode is here
        )

        # run for 10 seconds then stop
        if default_timer() - start > 10:
            print('total iterations: {}'.format(n+1))
            break

    p.print_results()

if __name__ == '__main__':
    main()
