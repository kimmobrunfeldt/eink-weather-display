
# pin numbers
class Pins:
    CS    = 8
    HRDY  = 24
    RESET = 17

# command codes
class Commands:
    SYS_RUN      = 0x01
    STANDBY      = 0x02
    SLEEP        = 0x03
    REG_RD       = 0x10
    REG_WR       = 0x11
    MEM_BST_RD_T = 0x12
    MEM_BST_RD_S = 0x13
    MEM_BST_WR   = 0x14
    MEM_BST_END  = 0x15
    LD_IMG       = 0x20
    LD_IMG_AREA  = 0x21
    LD_IMG_END   = 0x22

    # "user-defined" commands from Waveshare I guess
    DPY_AREA     = 0x034
    GET_DEV_INFO = 0x302
    DPY_BUF_AREA = 0x037
    VCOM         = 0x039

# rotation modes
# TODO: make sure CW/CCW are correct
class Rotate:
    NONE = 0
    CW   = 1
    CCW  = 3
    FLIP = 2  # 180 degree rotation

# TODO: get rid of these M's
class PixelModes:
    M_2BPP = 0
    M_3BPP = 1
    M_4BPP = 2
    M_8BPP = 3

# these waveform modes are described here:
# http://www.waveshare.net/w/upload/c/c4/E-paper-mode-declaration.pdf
class DisplayModes:
    INIT  = 0
    DU    = 1
    GC16  = 2
    GL16  = 3
    GLR16 = 4
    GLD16 = 5
    A2    = 6
    DU4   = 7

# modes that only require 2bpp
low_bpp_modes = {
    DisplayModes.INIT,
    DisplayModes.DU,
    DisplayModes.DU4,
    DisplayModes.A2
}

class EndianTypes:
    LITTLE = 0
    BIG    = 1

class AutoLUT:
    ENABLE  = 1
    DISABLE = 0

# LUT engine status?
ALL_LUTE_BUSY = 0xFFFF

class Registers:
    DBASE = 0x1000           # base address. register RW access for I80 only

    LUT0EWHR  = DBASE + 0x00  # LUT0 engine width height
    LUT0XYR   = DBASE + 0x40  # LUT0 XY
    LUT0BADDR = DBASE + 0x80  # LUT0 base address
    LUT0MFN   = DBASE + 0xC0  # LUT0 mode and frame number
    LUT01AF   = DBASE + 0x114 # LUT0/LUT1 active flag

    UP0SR     = DBASE + 0x134  # update parameter0 setting
    UP1SR     = DBASE + 0x138  # update parameter1 setting
    LUT0ABFRV = DBASE + 0x13C  # LUT0 alpha blend and fill rectangle value
    UPBBADDR  = DBASE + 0x17C  # update buffer base address
    LUT0IMXY  = DBASE + 0x180  # LUT0 image buffer X/Y offset
    LUTAFSR   = DBASE + 0x224  # LUT status (status of all LUT engines)

    BGVR      = DBASE + 0x250  # bitmap (1bpp) image color table

    I80CPCR = 0x04

    MBASE = 0x200
    MCSR  = MBASE + 0x0
    LISAR = MBASE + 0x8
