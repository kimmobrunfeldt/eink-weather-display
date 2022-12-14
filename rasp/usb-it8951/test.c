#include <unistd.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <stdint.h>
#include <sys/ioctl.h>

#define bswap_16(value) \
((((value) & 0xff) << 8) | ((value) >> 8))


void print_bytes(void *ptr, int size)
{
		unsigned char *p = ptr;
		int i;
		for (i=0; i<size; i++) {
				printf("%02hhX ", p[i]);
		}
		printf("\n");
}

int
main(int argc, char *argv[])
{
  int vcom = 1150;
  print_bytes(&vcom, 4);

  unsigned char vcom_be2[2];
  vcom_be2[0] = (vcom >> 8) & 0xff;
  vcom_be2[1] = vcom & 0xff;
  print_bytes(&vcom_be2, 2);
  // I used this https://asecuritysite.com/principles/numbers01
  // to verify that the Big-Endian bytes indeed represent the value 1150

  unsigned char result[2] = {
		0x04,
		0x7E,
	};
  print_bytes(&result, 2);

  short a;
  memcpy(&a, result, 2);
  print_bytes(&a, 2);

  uint32_t num = (uint32_t)result[0] << 8 | (uint32_t)result[1];
  print_bytes(&num, 4);

  printf("num: %d\n", num);
	return 0;
}