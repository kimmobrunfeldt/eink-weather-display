
from . import constants
from .constants import Commands, Registers, PixelModes
from .spi import SPI

from time import sleep

class EPD:
    '''
    An interface to the electronic paper display (EPD).

    Parameters
    ----------

    vcom : float
         The VCOM voltage that produces optimal display. Varies from
         device to device.

    **spi_kwargs
         Extra arguments will be passed to the SPI class's initialization.
         See spi.pyx for details.
    '''

    def __init__(self, vcom=-1.5, **spi_kwargs):

        self.spi = SPI(**spi_kwargs)

        self.width            = None
        self.height           = None
        self.img_buf_address  = None
        self.firmware_version = None
        self.lut_version      = None
        self.update_system_info()

        self._set_img_buf_base_addr(self.img_buf_address)

        # enable I80 packed mode
        self.write_register(Registers.I80CPCR, 0x1)

        self.set_vcom(vcom)

    def load_img_area(self, buf, rotate_mode=constants.Rotate.NONE, xy=None, dims=None, pixel_format=None):
        '''
        Write the pixel data in buf (an array of bytes, 1 per pixel) to device memory.
        This function does not actually display the image (see EPD.display_area).

        Parameters
        ----------

        buf : bytes
            An array of bytes containing the pixel data

        rotate_mode : constants.Rotate, optional
            A rotation mode for the data to be pasted into device memory

        xy : (int, int), optional
            The x,y coordinates of the top-left corner of the area being pasted. If omitted,
            the image is assumed to be the whole display area.

        dims : (int, int), optional
            The dimensions of the area being pasted. If xy is omitted (or set to None), the
            dimensions are assumed to be the dimensions of the display area.
        '''

        endian_type = constants.EndianTypes.BIG

        if pixel_format is None:
            pixel_format = constants.PixelModes.M_4BPP

        if xy is None:
            self._load_img_start(endian_type, pixel_format, rotate_mode)
        else:
            self._load_img_area_start(endian_type, pixel_format, rotate_mode, xy, dims)

        try:
            bpp = {
                PixelModes.M_2BPP : 2,
                PixelModes.M_4BPP : 4,
                PixelModes.M_8BPP : 8,
            }[pixel_format]
        except KeyError:
            raise ValueError("invalid pixel format") from None

        self.spi.pack_and_write_pixels(buf, bpp)

        self._load_img_end()

    def display_area(self, xy, dims, display_mode):
        '''
        Update a portion of the display to whatever is currently stored in device memory
        for that region. Updated data can be written to device memory using EPD.write_img_area
        '''
        self.spi.write_cmd(Commands.DPY_AREA, xy[0], xy[1], dims[0], dims[1], display_mode)

    def update_system_info(self):
        '''
        Get information about the system, and store it in class attributes
        '''
        self.spi.write_cmd(Commands.GET_DEV_INFO)
        data = self.spi.read_data(20)

        if all(x == 0 for x in data):
            raise RuntimeError("communication with device failed")

        self.width  = data[0]
        self.height = data[1]
        self.img_buf_address = data[3] << 16 | data[2]
        self.firmware_version = ''.join([chr(x>>8)+chr(x&0xFF) for x in data[4:12]])
        self.lut_version      = ''.join([chr(x>>8)+chr(x&0xFF) for x in data[12:20]])

    def get_vcom(self):
        '''
        Get the device's current value for VCOM voltage
        '''
        self.spi.write_cmd(Commands.VCOM, 0)
        vcom_int = self.spi.read_int()
        return -vcom_int/1000

    def set_vcom(self, vcom):
        '''
        Set the device's VCOM voltage
        '''
        self._validate_vcom(vcom)
        vcom_int = int(-1000*vcom)
        self.spi.write_cmd(Commands.VCOM, 1, vcom_int)

    def _validate_vcom(self, vcom):
        # TODO: figure out the actual limits for vcom
        if not -5 < vcom < 0:
            raise ValueError("vcom must be between -5 and 0")

    def run(self):
        self.spi.write_cmd(Commands.SYS_RUN)

    def standby(self):
        self.spi.write_cmd(Commands.STANDBY)

    def sleep(self):
        self.spi.write_cmd(Commands.SLEEP)

    def wait_display_ready(self):
        while(self.read_register(Registers.LUTAFSR)):
            sleep(0.01)

    def _load_img_start(self, endian_type, pixel_format, rotate_mode):
        arg = (endian_type << 8) | (pixel_format << 4) | rotate_mode
        self.spi.write_cmd(Commands.LD_IMG, arg)

    def _load_img_area_start(self, endian_type, pixel_format, rotate_mode, xy, dims):
        arg0 = (endian_type << 8) | (pixel_format << 4) | rotate_mode
        self.spi.write_cmd(Commands.LD_IMG_AREA, arg0, xy[0], xy[1], dims[0], dims[1])

    def _load_img_end(self):
        self.spi.write_cmd(Commands.LD_IMG_END)

    def read_register(self, address):
        '''
        Read a device register
        '''
        self.spi.write_cmd(Commands.REG_RD, address)
        return self.spi.read_int()

    def write_register(self, address, val):
        '''
        Write to a device register
        '''
        self.spi.write_cmd(Commands.REG_WR, address)
        self.spi.write_data((val,))

    def _set_img_buf_base_addr(self, address):
        word0 = address >> 16
        word1 = address & 0xFFFF
        self.write_register(Registers.LISAR+2, word0)
        self.write_register(Registers.LISAR, word1)

    ##########
    # the following functions are transcribed from example code from waveshare, but have not
    # been tested

    # def mem_burst_read_trigger(self, address, count):
    #     # these are both 32 bits, so we need to split them
    #     # up into two 16 bit values

    #     addr0 = address & 0xFFFF
    #     addr1 = address >> 16

    #     len0 = count & 0xFFFF
    #     len1 = count >> 16

    #     self.spi.write_cmd(Commands.MEM_BST_RD_T,
    #                        addr0, addr1, len0, len1)

    # def mem_burst_read_start(self):
    #     self.spi.write_cmd(Commands.MEM_BST_RD_S)

    # def mem_burst_write(self, address, count):
    #     addr0 = address & 0xFFFF
    #     addr1 = address >> 16

    #     len0 = count & 0xFFFF
    #     len1 = count >> 16

    #     self.spi.write_cmd(Commands.MEM_BST_WR,
    #                    addr0, addr1, len0, len1)

    # def mem_burst_end(self):
    #     self.spi.write_cmd(Commands.MEM_BST_END)

    # def display_area_1bpp(self, xy, dims, display_mode, background_gray, foreground_gray):

    #     # set display to 1bpp mode
    #     old_value = self.read_register(Registers.UP1SR+2)
    #     self.write_register(Registers.UP1SR+2, old_val | (1<<2))

    #     # set color table
    #     self.write_register(Registers.BGVR, (background_gray << 8) | foreground_gray)

    #     # display image
    #     self.display_area(xy, dims, display_mode)
    #     self.wait_display_ready()

    #     # back to normal mode
    #     old_value = self.read_register(Registers.UP1SR+2)
    #     self.write_register(Registers.UP1SR+2, old_value & ~(1<<2))

    # def display_area_buf(self, xy, dims, display_mode, display_buf_address):
    #     self.spi.write_cmd(Commands.DPY_BUF_AREA, xy[0], xy[1], dims[0], dims[1], display_mode,
    #                        display_buf_address & 0xFFFF, display_buf_address >> 16)
