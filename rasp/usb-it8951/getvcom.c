#include <unistd.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
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


typedef struct it8951_deviceinfo {
	unsigned int uiStandardCmdNo;
	unsigned int uiExtendedCmdNo;
	unsigned int uiSignature;
	unsigned int uiVersion;
	unsigned int width;
	unsigned int height;
	unsigned int update_buffer_addr;
	unsigned int image_buffer_addr;
	unsigned int temperature_segment;
	unsigned int ui_mode;
	unsigned int frame_count[8];
	unsigned int buffer_count;
	unsigned int reserved[9];
	void *command_table;
} IT8951_deviceinfo;

typedef struct it8951_area {
	int address;
	int x;
	int y;
	int w;
	int h;
} IT8951_area;

typedef struct it8951_display_area {
	int address;
	int wavemode;
	int x;
	int y;
	int w;
	int h;
	int wait_ready;
} IT8951_display_area;


typedef struct it8951_get_vcom {
  unsigned char m_volt[16];
} IT8951_get_vcom;

int debug = 0;
int clear = 0;


void
print_vcom(const char *filename)
{
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

  printf("vendor_id: %s\n", inquiry->vendor_id);
  printf("product_id: %s\n", inquiry->product_id);
  printf("product_ver: %s\n", inquiry->product_ver);

	unsigned char get_vcom_cmd[16] = {
		0xfe, // Customer command.
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
		0xa3,  // PMIC (Power Management Integrated Circuits) command.
		0x00,
    0x00,
		0x00,   // Do Set VCom? (0 – no, 1 – yes)
		0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
	};

  unsigned char get_vcom_result[2];
  memset(&get_vcom_result, 0, sizeof(IT8951_get_vcom));

	memset(&io_hdr, 0, sizeof(sg_io_hdr_t));
	io_hdr.interface_id = 'S';
	io_hdr.cmd_len = 16;
	io_hdr.dxfer_direction = SG_DXFER_TO_DEV;
	io_hdr.dxfer_len = sizeof(IT8951_get_vcom);
  io_hdr.dxferp = get_vcom_result;
	io_hdr.cmdp = get_vcom_cmd;
	io_hdr.timeout = 5000;

	if (ioctl(fd, SG_IO, &io_hdr) < 0) {
		perror("SG_IO get_vcom failed");
	}

  IT8951_get_vcom *get_vcom_res = (IT8951_get_vcom *) get_vcom_result;

  printf("Got vcom: %d\n", get_vcom_res->m_volt);
  print_bytes(get_vcom_res, sizeof(IT8951_get_vcom));
}

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
pmic_set(int fd, int power, int vcom)
{


	unsigned char load_image_cmd[16] = {
		0xfe, 0x00, 0x00, 0x00, 0x00, 0x00,
		0xa3,
		(vcom >> 8) & 0xff, vcom & 0xff,
		0x01,
		0x01, power & 0xff
	};

	sg_io_hdr_t io_hdr;

	memset(&io_hdr, 0, sizeof(sg_io_hdr_t));
	io_hdr.interface_id = 'S';
	io_hdr.cmd_len = 16;
	io_hdr.dxfer_direction = SG_DXFER_TO_DEV;
	io_hdr.dxfer_len = 0;
	io_hdr.cmdp = load_image_cmd;
	io_hdr.timeout = 5000;

	if (ioctl(fd, SG_IO, &io_hdr) < 0) {
		perror("SG_IO power set failed");
	}
	return 0;
}



void
print_usage(const char *name)
{
	fprintf(stderr, "Usage: %s [-m mode] [-dc] device x y w h\n", name);
	fprintf(stderr, "Options are:\n"
			"    -m: Refresh mode, 0=blank, 2=G16 (default), 4=A2\n"
			"    -d: Enable debug output\n"
			"    -c: Use a clean image instead of stdin\n"
			"    device: path to the disk device\n"
			"    x y: position of the image\n"
			"    w h: width and height of the image\n\n"
			"    Send the image to stdin as 8 bit grayscale\n");
	exit(EXIT_FAILURE);
}

int
main(int argc, char *argv[])
{
	int opt;
	int mode = 2;
	while ((opt = getopt(argc, argv, "m:dc")) != -1) {
		switch (opt) {
			case 'm':
				mode = strtol(optarg, NULL, 10);
				break;
			case 'd':
				debug = 1;
				break;
			case 'c':
				clear = 1;
				break;
			default:
				print_usage(argv[0]);
		}
	}

	if (argc - optind < 5) {
		print_usage(argv[0]);
	}
	int x = strtol(argv[optind + 1], NULL, 10);
	int y = strtol(argv[optind + 2], NULL, 10);
	int w = strtol(argv[optind + 3], NULL, 10);
	int h = strtol(argv[optind + 4], NULL, 10);

  print_vcom(argv[optind]);
	return 0;
}
