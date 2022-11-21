
import warnings
from PIL import Image, ImageChops

from .constants import DisplayModes, PixelModes, low_bpp_modes
from . import img_manip

try:
    from .interface import EPD
except ModuleNotFoundError:
    EPD = None

class AutoDisplay:
    '''
    This base class tracks changes to its frame_buf attribute, and automatically
    updates only the portions of the display that need to be updated

    Updates are done by calling the update() method, which derived classes should
    implement.

    Note: width and height should be of the physical display, and don't depend on
    rotation---they will be swapped automatically if rotate is set to CW or CCW
    '''

    def __init__(self, width, height, rotate=None, mirror=False, track_gray=False):
        self._set_rotate(rotate, mirror)

        self.display_dims = (width, height)
        if rotate in ('CW', 'CCW'):
            self.frame_buf = Image.new('L', (height, width), 0xFF)
        else:
            self.frame_buf = Image.new('L', (width, height), 0xFF)

        # keep track of what we have updated,
        # so that we can automatically do partial updates of only the
        # relevant portions of the display
        self.prev_frame = None

        self.track_gray = track_gray
        if track_gray:
            # keep track of what has changed since the last grayscale update
            # so that we make sure we clear any black/white intermediates
            # start out with no changes
            self.gray_change_bbox = None

    @property
    def width(self):
        return self.frame_buf.width

    @property
    def height(self):
        return self.frame_buf.height

    def _get_frame_buf(self):
        '''
        Return the frame buf, rotated according to flip. Always returns a copy, even
        when rotate is None.
        '''
        if self._rotate_method is None:
            return self.frame_buf.copy()

        return self.frame_buf.transpose(self._rotate_method)

    def _set_rotate(self, rotate, mirror):

        if not mirror:
            methods = {
                None   : None,
                'CW'   : Image.Transpose.ROTATE_270,
                'CCW'  : Image.Transpose.ROTATE_90,
                'flip' : Image.Transpose.ROTATE_180,
            }
        else:
            methods = {
                None   : Image.Transpose.FLIP_LEFT_RIGHT,
                'CW'   : Image.Transpose.TRANSPOSE,
                'CCW'  : Image.Transpose.TRANSVERSE,
                'flip' : Image.Transpose.FLIP_TOP_BOTTOM,
            }

        if rotate not in methods:
            raise ValueError("invalid value for 'rotate'---options are None, 'CW', 'CCW', and 'flip'")

        self._rotate_method = methods[rotate]

    def draw_full(self, mode):
        '''
        Write the full image to the device, and display it using mode
        '''
        frame = self._get_frame_buf()

        self.update(frame.tobytes(), (0,0), self.display_dims, mode)

        if self.track_gray:
            if mode == DisplayModes.DU:
                diff_box = self._compute_diff_box(self.prev_frame, frame, round_to=8)
                self.gray_change_bbox = self._merge_bbox(self.gray_change_bbox, diff_box)
            else:
                self.gray_change_bbox = None

        self.prev_frame = frame

    def draw_partial(self, mode):
        '''
        Write only the rectangle bounding the pixels of the image that have changed
        since the last call to draw_full or draw_partial
        '''

        if self.prev_frame is None:  # first call since initialization
            self.draw_full(mode)

        if mode in low_bpp_modes:
            round_box = 8
        else:
            round_box = 4

        frame = self._get_frame_buf()

        # compute diff for this frame
        diff_box = self._compute_diff_box(self.prev_frame, frame, round_to=round_box)

        if self.track_gray:
            self.gray_change_bbox = self._merge_bbox(self.gray_change_bbox, diff_box)
            # reset grayscale changes to zero
            if mode != DisplayModes.DU:
                diff_box = self._round_bbox(self.gray_change_bbox, round_to=round_box)
                self.gray_change_bbox = None

        # if it is, nothing to do
        if diff_box is not None:
            buf = frame.crop(diff_box)

            # if we are using a black/white only mode, any pixels that changed should be
            # converted to black/white
            if mode == DisplayModes.DU:
                img_manip.make_changes_bw(frame.crop(diff_box), buf)

            xy = (diff_box[0], diff_box[1])
            dims = (diff_box[2]-diff_box[0], diff_box[3]-diff_box[1])

            self.update(buf.tobytes(), xy, dims, mode)

        self.prev_frame = frame

    def clear(self):
        '''
        Clear display, device image buffer, and frame buffer (e.g. at startup)
        '''
        # set frame buffer to all white
        self.frame_buf.paste(0xFF, box=(0, 0, self.width, self.height))
        self.draw_full(DisplayModes.INIT)

    @classmethod
    def _compute_diff_box(cls, a, b, round_to=2):
        '''
        Find the four coordinates giving the bounding box of differences between a and b
        making sure they are divisible by round_to

        Parameters
        ----------

        a : PIL.Image
            The first image

        b : PIL.Image
            The second image

        round_to : int
            The multiple to align the bbox to
        '''
        box = ImageChops.difference(a, b).getbbox()
        if box is None:
            return None
        return cls._round_bbox(box, round_to)

    @staticmethod
    def _round_bbox(box, round_to=4):
        '''
        Round a bounding box so the edges are divisible by round_to
        '''
        minx, miny, maxx, maxy = box
        minx -= minx%round_to
        maxx += round_to-1 - (maxx-1)%round_to
        miny -= miny%round_to
        maxy += round_to-1 - (maxy-1)%round_to
        return (minx, miny, maxx, maxy)

    @staticmethod
    def _merge_bbox(a, b):
        '''
        Return a bounding box that contains both bboxes a and b
        '''
        if a is None:
            return b

        if b is None:
            return a

        minx = min(a[0], b[0])
        miny = min(a[1], b[1])
        maxx = max(a[2], b[2])
        maxy = max(a[3], b[3])
        return (minx, miny, maxx, maxy)

    def update(self, data, xy, dims, mode):
        raise NotImplementedError


class AutoEPDDisplay(AutoDisplay):
    '''
    This class initializes the EPD, and uses it to display the updates
    '''

    def __init__(self, epd=None, vcom=-2.06,
                 bus=0, device=0, spi_hz=24000000,
                 **kwargs):

        if epd is None:
            if EPD is None:
                raise RuntimeError('Problem importing EPD interface. Did you build the '
                                   'backend with "pip install ./" or "python setup.py '
                                   'build_ext --inplace"?')

            epd = EPD(vcom=vcom, bus=bus, device=device, data_hz=spi_hz)

        self.epd = epd
        AutoDisplay.__init__(self, self.epd.width, self.epd.height, **kwargs)

    def update(self, data, xy, dims, mode, pixel_format=PixelModes.M_4BPP):

        # these modes only use two pixels, so use a more dense packing for them
        # TODO: 2BPP doesn't seem to refresh correctly?
        # if mode in low_bpp_modes:
        #     pixel_format = PixelModes.M_2BPP
        # else:
        #     pixel_format = PixelModes.M_4BPP

        # send image to controller
        self.epd.wait_display_ready()
        self.epd.load_img_area(
            data,
            xy=xy,
            dims=dims,
            pixel_format=pixel_format
        )

        # display sent image
        self.epd.display_area(
            xy,
            dims,
            mode
        )


class VirtualEPDDisplay(AutoDisplay):
    '''
    This class opens a Tkinter window showing what would be displayed on the
    EPD, to allow testing without a physical e-paper device
    '''

    def __init__(self, dims=(800,600), **kwargs):
        AutoDisplay.__init__(self, dims[0], dims[1], **kwargs)

        import tkinter as tk
        from PIL import ImageTk

        self.root = tk.Tk()
        self.photoimage = ImageTk.PhotoImage

        self.pil_img = self._get_frame_buf().copy()
        self.tk_img = self.photoimage(self.pil_img)
        self.panel = tk.Label(self.root, image=self.tk_img)
        self.panel.pack(side="bottom", fill="both", expand="yes")

    def __del__(self):
        self.root.destroy()

    def update(self, data, xy, dims, mode):
        data_img = Image.frombytes(self._get_frame_buf().mode, dims, bytes(data))
        self.pil_img.paste(data_img, box=xy)
        self.tk_img = self.photoimage(self.pil_img)
        self.panel.configure(image=self.tk_img) # not sure if this is actually necessary

        # allow Tk to do whatever it needs to do
        self.root.update()
