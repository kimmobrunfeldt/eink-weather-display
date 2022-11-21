**Note, copied from https://sr.ht/~martijnbraam/it8951/**


Original readme below:

# IT8951 e-paper controller

This is a small utility to send images to an e-paper display using an IT8951
controller like the waveshare e-paper hat. Instead of using the i2c, i80 or spi
interface this uses the USB interface that is normally used with the
E-LINK TCON DEMO windows application.

The usb interface of the IT8951 controller shows up as an usb mass storage
device with no medium inserted (similar to SD card readers). The display is
controlled by sending customer-defined SCSI commands. This also means this
utility needs root permissions to be able to control the display.

## Building

```shell-session
$ mkdir build
$ cd build
$ cmake ..
$ make
```

## Usage

```shell-session
Clear the display
$ sudo ./it8951 -c -m 0 /dev/sdb 0 0 800 600

Send an 8-bit grayscale image
$ sudo ./it8951 /dev/sdb 0 0 800 600 < image.raw

Generate an image and display it
$ convert -background white -fill black \
  -font Ubuntu -pointsize 50 label:"$(date)" \
  -gravity Center -extent 800x600 \
  -depth 8 gray:- \
  | sudo ./it8951 -d -m 2 /dev/sdb 0 0 800 600

Draw an image in A2 (fast 1-bit) mode
$ sudo ./it8951 -m 4 /dev/sdb 0 0 800 600 < image.raw
```