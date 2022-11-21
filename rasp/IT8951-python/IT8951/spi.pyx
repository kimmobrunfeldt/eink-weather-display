# cython: language_level=3
# cython: profile=True

'''
This module implements SPI communication with the device through the Linux kernel,
using /dev/spidev*. It also implements pixel packing for the communication, and
handles operating the RESET and HRDY pins on the device.

It incorporates ideas/code from:

 - py-spidev: https://github.com/doceme/py-spidev
 - this cython SPI driver from @kcarnold: https://gist.github.com/kcarnold/6045448
 - this implementation of the library's backend using py-spidev: https://github.com/kleini/it8951
'''

cimport cython
import os
from posix.ioctl cimport ioctl
from libc.string cimport memset
from time import time, sleep

import RPi.GPIO as GPIO

from .constants import Pins, PixelModes

cdef extern from "linux/spi/spidev.h":
    struct spi_ioc_transfer:
        unsigned long tx_buf
        unsigned long rx_buf
        int len
        int speed_hz
        int delay_usecs
        int bits_per_word
        int cs_change
        int pad

    int SPI_IOC_MESSAGE(int num)

    cdef int SPI_IOC_RD_MODE, SPI_IOC_RD_BITS_PER_WORD, SPI_IOC_RD_MAX_SPEED_HZ
    cdef int SPI_IOC_WR_MODE, SPI_IOC_WR_BITS_PER_WORD, SPI_IOC_WR_MAX_SPEED_HZ

cdef class SPI:
    cdef int fd, _mode, _bits_per_word, data_hz, cmd_hz, delay
    cdef int max_block_size
    cdef float timeout_secs

    cdef unsigned char [:] write_buf, read_buf

    def __cinit__(self, bus=0, device=0, int cmd_hz=1000000, int data_hz=24000000, float timeout_secs=5):
        self.fd = -1
        fd_path = '/dev/spidev{}.{}'.format(bus, device)
        self.fd = os.open(fd_path, os.O_RDWR)

        self._set_max_block_size()

        # pre-allocate buffers so we aren't reallocating them all the time
        self.write_buf = cython.view.array(shape=(self.max_block_size,), itemsize=sizeof(unsigned char), format='B')
        self.read_buf  = cython.view.array(shape=(self.max_block_size,), itemsize=sizeof(unsigned char), format='B')

        # the default spi frequency is way too fast; also it seems that we can set the SPI frequency for data transfer
        # to be a lot higher than for sending commands
        self.cmd_hz = cmd_hz
        self.data_hz = data_hz

        self.timeout_secs = timeout_secs

        self.delay = 0

        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)
        GPIO.setup(Pins.HRDY, GPIO.IN, pull_up_down=GPIO.PUD_DOWN)
        GPIO.setup(Pins.RESET, GPIO.OUT, initial=GPIO.HIGH)

        # reset
        GPIO.output(Pins.RESET, GPIO.LOW)
        sleep(0.1)
        GPIO.output(Pins.RESET, GPIO.HIGH)

    def __del__(self):
        GPIO.cleanup([Pins.HRDY, Pins.RESET])
        if self.fd != -1:
            os.close(self.fd)

    def _set_max_block_size(self):
        '''
        Try to find the maximum SPI transfer size. If it doesn't work, we have
        a reasonable default, so whatever
        '''
        try:
            self.max_block_size = int(open('/sys/module/spidev/parameters/bufsiz').read())
        except: # we really don't care what the error was; if it didn't work fall back to default
            self.max_block_size = 4096
            print('warning: could not find maximum SPI transfer size; defaulting to {}'.format(self.max_block_size))

        # make sure the max block size isn't absurdly large
        if self.max_block_size > 2**16:
            self.max_block_size == 2**16

    ##### methods to communicate with the device

    def wait_ready(self):
        '''
        Wait for the device's ready pin to be set
        '''
        start = time()
        while not GPIO.input(Pins.HRDY):
            if time()-start > self.timeout_secs:
                raise TimeoutError("Timed out waiting for display to respond")
            sleep(0.001)

    def transfer(self, int size, int speed):
        '''
        Perform an SPI transaction of *size* bytes on the preallocated read and write buffers.
        '''
        cdef spi_ioc_transfer tr

        self.wait_ready()

        memset(&tr, 0, sizeof(tr))

        # set up our transmit and receive buffers
        tr.rx_buf = <unsigned long>&(self.read_buf[0])
        tr.tx_buf = <unsigned long>&(self.write_buf[0])

        # set the other transfer parameters
        tr.len = size
        tr.delay_usecs = self.delay
        tr.speed_hz = speed
        tr.bits_per_word = self.bits_per_word

        #print('w:', ','.join(hex(x) for x in write_buf))

        result = ioctl(self.fd, SPI_IOC_MESSAGE(1), &tr);

        #print('r:', ','.join(hex(x) for x in read_buf))

        if result < 1:
            raise IOError("spi transfer failed with result {}".format(result))

    def read(self, int preamble, int count):
        '''
        Send preamble, and return a buffer of 16-bit unsigned ints of length count
        containing the data received
        '''

        cdef int buflen = 2*count + 4  # two bytes per int, and the extra is for the preamble + dummy bytes

        self.write_buf[0] = preamble >> 8
        self.write_buf[1] = preamble & 0xFF

        self.transfer(buflen, speed=self.cmd_hz)

        rtn = cython.view.array(shape=(count,), itemsize=sizeof(unsigned short), format='H')
        cdef int i
        for i in range(count):
            rtn[i] = self.read_buf[2*i + 4] << 8
            rtn[i] |= self.read_buf[2*i + 5]

        #print('read data:', ','.join(hex(x) for x in rtn))

        return rtn

    def write(self, int preamble, ary):
        '''
        Send preamble, and then write the data in ary (16-bit unsigned ints) over SPI
        '''
        cdef int buflen = 2*len(ary) + 2  # two bytes per int, and the extra is for the preamble

        self.write_buf[0] = preamble >> 8
        self.write_buf[1] = preamble & 0xFF

        cdef int i
        for i in range(len(ary)):
            self.write_buf[2*i+2] = ary[i] >> 8
            self.write_buf[2*i+3] = ary[i] & 0xFF

        self.transfer(buflen, speed=self.cmd_hz)

    @cython.boundscheck(False)
    @cython.wraparound(False)
    @cython.initializedcheck(False)
    @cython.cdivision(True)
    def pack_and_write_pixels(self, const unsigned char [:] pixbuf, int bpp):
        '''
        Pack pixels into a byte buffer, and write them to the device. Pixbuf should be
        an array with each value an individual pixel, in the range 0x00-0xFF.
        '''
        cdef int pix_count, nbytes, i, byte_idx, pix_shift, block_start, t
        cdef int preamble = 0x0000
        cdef int pix_per_byte = 8 // bpp
        cdef int pixbuf_len = len(pixbuf)

        # transfer only full 16 bit words
        cdef int pix_per_block = 2*pix_per_byte * ((self.max_block_size - 2)//2)

        for block_start in range(0, pixbuf_len, pix_per_block):
            pix_count = min(pix_per_block, pixbuf_len-block_start)

            self.write_buf[0] = preamble >> 8
            self.write_buf[1] = preamble & 0xFF

            # TODO: make the following more readable
            nbytes = 2 + 2*((pix_count+2*pix_per_byte-1)//(2*pix_per_byte))
            for byte_idx in range(2, nbytes):
                t = 0
                for i in range(pix_per_byte):
                    pix_idx = block_start + (byte_idx-2)*pix_per_byte + i
                    t <<= bpp
                    t |= pixbuf[pix_idx] >> (8-bpp)
                self.write_buf[byte_idx] = t

            # it seems we can crank up the SPI speed here somewhat
            self.transfer(nbytes, speed=self.data_hz)

    ##### higher level read/write functions

    def write_cmd(self, cmd, *args):
        '''
        Send the device a command code

        Parameters
        ----------

        cmd : int (from constants.Commands)
            The command to send

        args : list(int), optional
            Arguments for the command
        '''
        self.write(0x6000, [cmd])  # 0x6000 is preamble
        for arg in args:
            self.write_data([arg])

    def write_data(self, ary):
        '''
        Send the device an array of data

        Parameters
        ----------

        ary : array-like
            The data
        '''
        self.write(0x0000, ary)

    def read_data(self, n):
        '''
        Read n 16-bit words of data from the device

        Parameters
        ----------

        n : int
            The number of 2-byte words to read
        '''
        return self.read(0x1000, n)

    def read_int(self):
        '''
        Read a single 16 bit int from the device
        '''
        return self.read_data(1)[0]


    ##### properties to get/set mode, frequency, bits per word
    # allows access as e.g. `SPI.bits_per_word = 8`

    @property
    def mode(self):
        result = ioctl(self.fd, SPI_IOC_RD_MODE, &self._mode)
        if result == -1:
            raise IOError("failed getting mode")
        return self._mode

    @mode.setter
    def mode(self, int new_mode):
        self._mode = new_mode
        result = ioctl(self.fd, SPI_IOC_WR_MODE, &self._mode)
        if result == -1:
            raise IOError("failed setting mode")

    @property
    def bits_per_word(self):
        result = ioctl(self.fd, SPI_IOC_RD_BITS_PER_WORD, &self._bits_per_word)
        if result == -1:
            raise IOError("failed getting bits_per_word")
        return self._bits_per_word

    @bits_per_word.setter
    def bits_per_word(self, int new_bits_per_word):
        self._bits_per_word = new_bits_per_word
        result = ioctl(self.fd, SPI_IOC_WR_BITS_PER_WORD, &self._bits_per_word)
        if result == -1:
            raise IOError("failed setting bits_per_word")
