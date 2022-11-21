
# Changelog

## 0.1.1 - 2022-05-02

### Added

 - "mirror" option to reverse display
 - configurable timeout when waiting for display ready

### Removed

 - "flip" option (use `rotate="flip"` instead)

## 0.1.0

For this version the backend was rewritten, so that the SPI communication happens directly
by communicating with the Linux kernel through `/dev/spidev*`. This means:

 - `sudo` no longer required
 - requires neither the `bcm2835` C library nor the `spidev` Python module
 - data transfer is way faster than before!
