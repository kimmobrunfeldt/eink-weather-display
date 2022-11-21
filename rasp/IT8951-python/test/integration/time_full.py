
import cProfile
import pstats
import io

from IT8951 import constants
from IT8951.display import AutoEPDDisplay

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
    display = AutoEPDDisplay(vcom=-2.06, spi_hz=24000000)

    display.clear()

    # so that we're not timing the previous operations
    display.epd.wait_display_ready()

    print('Doing update...')

    # draw all black
    display.frame_buf.paste(0x00, (0, 0, display.width, display.height))

    p = Profiler()
    p.profile_func(
        display.draw_partial,
        constants.DisplayModes.DU   # should see what best mode is here
    )
    p.profile_func(display.epd.spi.wait_ready)
    p.print_results()

if __name__ == '__main__':
    main()
