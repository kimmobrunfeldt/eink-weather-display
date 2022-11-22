#include <unistd.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <errno.h>
#include <sys/ioctl.h>
#include <scsi/scsi.h>
#include <scsi/sg.h>
#include <byteswap.h>


#define MAX_TRANSFER 60800

typedef struct it8951_inquiry {
	unsigned char dontcare[8];
	unsigned char vendor_id[8];
	unsigned char product_id[16];
	unsigned char product_ver[4];
} IT8951_inquiry;


void print_bytes(void *ptr, int size)
{
	unsigned char *p = ptr;
	int i;
	for (i=0; i<size; i++) {
			printf("%02hhX ", p[i]);
	}
	printf("\n");
}

void
print_vcom(int fd)
{
	unsigned char get_vcom_cmd[16] = {
		0xfe, // Customer command.
		0x00,
		0x00,
		0x00,
		0x00,
		0x00,
		0xa3,	// PMIC (Power Management Integrated Circuits) command.
		0x00,
		0x00,
		0x00,	 // Do Set VCom? (0 – no, 1 – yes)
		0x00,
		0x00,
		0x00,
		0x00,
		0x00,
		0x00,
	};

	unsigned char get_vcom_result[2];
	memset(&get_vcom_result, 0, 2);

	sg_io_hdr_t io_hdr;
	memset(&io_hdr, 0, sizeof(sg_io_hdr_t));
	io_hdr.interface_id = 'S';
	io_hdr.cmd_len = 16;
	io_hdr.dxfer_direction = SG_DXFER_FROM_DEV;
	io_hdr.dxfer_len = sizeof(get_vcom_result);
	io_hdr.dxferp = get_vcom_result;
	io_hdr.cmdp = get_vcom_cmd;
	io_hdr.timeout = 5000;

	if (ioctl(fd, SG_IO, &io_hdr) < 0) {
		perror("SG_IO get_vcom failed");
	}

	printf("Get vcom response (bytes):\n");
	print_bytes(&get_vcom_result, sizeof(get_vcom_result));

	int vcom_value = 0;
	vcom_value = (int)get_vcom_result[0] << 8 | (int)get_vcom_result[1]; // Convert BE -> LE
	printf("Vcom value: %d\n", vcom_value);
}

int pmic_set(int fd, int vcom)
{
	unsigned char set_vcom_cmd[16] = {
		0xfe, // Customer command.
		0x00,
		0x00,
		0x00,
		0x00,
		0x00,
		0xa3, // PMIC (Power Management Integrated Circuits) command.
		// Vcom millivolts interger value as big endian  // E.g. 2500 => -2500 mV = -2.5V
		(vcom >> 8) & 0xff,
		vcom & 0xff,
		0x01, // Do Set VCom? (0 – no, 1 – yes)
		0x00,
		0x00,
		0x00,
		0x00,
		0x00,
		0x00,
	};

	sg_io_hdr_t io_hdr;

	memset(&io_hdr, 0, sizeof(sg_io_hdr_t));
	io_hdr.interface_id = 'S';
	io_hdr.cmd_len = 16;
	io_hdr.dxfer_direction = SG_DXFER_TO_DEV;
	io_hdr.dxfer_len = 0;
	io_hdr.cmdp = set_vcom_cmd;
	io_hdr.timeout = 5000;

	if (ioctl(fd, SG_IO, &io_hdr) < 0) {
		perror("SG_IO power set failed");
	}
	return 0;
}

void
print_usage(const char *name)
{
	fprintf(stderr, "Usage: %s [-v vcom]\n", name);
	fprintf(stderr, "Options are:\n"
			"		-v: Set vcom before printing. Value as positive millivoltage integer. E.g. 2500 (-2500 mV = -2.5V)\n");
	exit(EXIT_FAILURE);
}

int
main(int argc, char *argv[])
{
	int opt;
	int vcom = 1500;
  int set_vcom = 0;

	while ((opt = getopt(argc, argv, "v:")) != -1) {
		switch (opt) {
			case 'v':
				vcom = strtol(optarg, NULL, 10);
        set_vcom = 1;
				break;
			default:
				print_usage(argv[0]);
		}
	}

  const char *filename = argv[optind];
	int fd, to, res;
	fd = open(filename, O_RDWR | O_NONBLOCK);
	if (fd < 0) {
		perror("Could not open scsi device");
		exit(EXIT_FAILURE);
	}

	res = ioctl(fd, SCSI_IOCTL_GET_BUS_NUMBER, &to);
	if (res < 0) {
		fprintf(stderr, "%s is not a SCSI device\n", filename);
		exit(EXIT_FAILURE);
	}

	unsigned char inquiry_cmd[6] = {0x12, 0, 0, 0, 0, 0};
	unsigned char inquiry_result[96];

	sg_io_hdr_t io_hdr;

	memset(&io_hdr, 0, sizeof(sg_io_hdr_t));
	io_hdr.interface_id = 'S';
	io_hdr.cmd_len = 6;
	io_hdr.dxfer_direction = SG_DXFER_FROM_DEV;
	io_hdr.dxfer_len = 96;
	io_hdr.dxferp = inquiry_result;
	io_hdr.cmdp = inquiry_cmd;
	io_hdr.timeout = 1000;

	if (ioctl(fd, SG_IO, &io_hdr) < 0) {
		perror("SG_IO INQUIRY failed");
	}

	IT8951_inquiry *inquiry = (IT8951_inquiry *) inquiry_result;

	if (strncmp(inquiry->vendor_id, "Generic ", 8) != 0) {
		fprintf(stderr, "SCSI Vendor does not match\n");
		exit(EXIT_FAILURE);
	}
	if (strncmp(inquiry->product_id, "Storage RamDisc ", 8) != 0) {
		fprintf(stderr, "SCSI Product does not match\n");
		exit(EXIT_FAILURE);
	}
	if (strncmp(inquiry->product_ver, "1.00", 4) != 0) {
		fprintf(stderr, "SCSI Productver does not match\n");
		exit(EXIT_FAILURE);
	}

	if (set_vcom == 1) {
		pmic_set(fd, vcom);
	}

  print_vcom(fd);

	return 0;
}