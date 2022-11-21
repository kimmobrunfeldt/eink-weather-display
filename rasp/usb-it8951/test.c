#include <unistd.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <sys/ioctl.h>

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

  unsigned char vcom_be1[2];
  memset(&vcom_be1, bswap_16(vcom), 2);
  print_bytes(&vcom_be1, 2);

  unsigned char vcom_be2[2];
  vcom_be2[0] = (vcom >> 8) & 0xff;
  vcom_be2[1] = vcom & 0xff;
  print_bytes(&vcom_be2, 2);
  // I used this https://asecuritysite.com/principles/numbers01
  // to verify that the Big-Endian bytes indeed represent the value 1150

	return 0;
}